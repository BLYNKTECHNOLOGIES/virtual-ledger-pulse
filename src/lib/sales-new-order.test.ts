import { describe, it, expect, vi } from "vitest";
const usage = vi.hoisted(() => ({ compute: vi.fn() }));
vi.mock("@/lib/payment-method-usage", () => ({ computeSalesPaymentMethodUsage: usage.compute }));
import {
  buildNewOrderRpcArgs,
  isMethodAvailable,
  istDay,
  newOrderErrorMessage,
  pickAutoMethod,
  platformFeeFor,
  quantityFor,
  riskCategoryForAppetite,
  usageWindowStart,
  withLiveSalesUsage,
  type NewOrderInput,
} from "./sales-new-order";

// public.sales_orders columns in production (catalog, 2026-10-24).
const SALES_ORDER_COLUMNS = [
  "id", "order_number", "client_name", "client_phone", "platform", "product_id", "warehouse_id", "quantity", "price_per_unit",
  "total_amount", "sales_payment_method_id", "payment_status", "status", "order_date", "description", "cosmos_alert", "risk_level",
  "created_by", "created_at", "updated_at", "settlement_status", "settlement_batch_id", "settled_at", "wallet_id", "usdt_amount",
  "is_off_market", "fee_percentage", "fee_amount", "net_amount", "client_state", "source", "terminal_sync_id", "sale_type",
  "market_rate_usdt", "client_id", "effective_usdt_qty", "effective_usdt_rate", "is_split_payment",
];

describe("riskCategoryForAppetite", () => {
  it("maps the current client risk appetites", () => {
    expect(riskCategoryForAppetite("PREMIUM")).toBe("No Risk");
    expect(riskCategoryForAppetite("ESTABLISHED")).toBe("Low Risk");
    expect(riskCategoryForAppetite("STANDARD")).toBe("Medium Risk");
    expect(riskCategoryForAppetite("CAUTIOUS")).toBe("High Risk");
    expect(riskCategoryForAppetite("HIGH_RISK")).toBe("High Risk");
  });
  it("maps the legacy values", () => {
    expect(riskCategoryForAppetite("NONE")).toBe("No Risk");
    expect(riskCategoryForAppetite("LOW")).toBe("Low Risk");
    expect(riskCategoryForAppetite("MEDIUM")).toBe("Medium Risk");
    expect(riskCategoryForAppetite("HIGH")).toBe("High Risk");
  });
  it("treats anything else as High Risk and ignores case and spaces", () => {
    expect(riskCategoryForAppetite("SOMETHING_NEW")).toBe("High Risk");
    expect(riskCategoryForAppetite("")).toBe("High Risk");
    expect(riskCategoryForAppetite(null)).toBe("High Risk");
    expect(riskCategoryForAppetite(undefined)).toBe("High Risk");
    expect(riskCategoryForAppetite(" standard ")).toBe("Medium Risk");
  });
});

describe("receiving account availability", () => {
  const active = { status: "ACTIVE" };
  it("needs an active bank account and live usage below the limit", () => {
    expect(isMethodAvailable({ id: "a", payment_limit: 100000, bank_accounts: active }, 99999)).toBe(true);
    expect(isMethodAvailable({ id: "a", payment_limit: "100000", bank_accounts: active }, 100000)).toBe(false);
    expect(isMethodAvailable({ id: "a", payment_limit: 100000, bank_accounts: { status: "INACTIVE" } }, 0)).toBe(false);
    expect(isMethodAvailable({ id: "a", payment_limit: 100000, bank_accounts: null }, 0)).toBe(false);
    expect(isMethodAvailable({ id: "a", payment_limit: 0, bank_accounts: active }, 0)).toBe(false);
  });
  it("auto-selects UPI first, then the account with the most room", () => {
    const methods = [
      { id: "bank-big", type: "Bank Account", payment_limit: 5000000, bank_accounts: active },
      { id: "upi-small", type: "UPI", payment_limit: 100000, bank_accounts: active },
      { id: "upi-big", type: "UPI", payment_limit: 700000, bank_accounts: active },
      { id: "upi-full", type: "UPI", payment_limit: 900000, bank_accounts: active },
    ];
    const usage: Record<string, number> = { "bank-big": 0, "upi-small": 0, "upi-big": 650000, "upi-full": 900000 };
    expect(pickAutoMethod(methods, (m) => usage[m.id])?.id).toBe("upi-small");
    expect(pickAutoMethod(methods.filter((m) => m.type === "Bank Account"), (m) => usage[m.id])?.id).toBe("bank-big");
    expect(pickAutoMethod([methods[3]], (m) => usage[m.id])).toBeNull();
  });
});

describe("istDay", () => {
  it("uses the India calendar day, not the UTC day", () => {
    expect(istDay(new Date("2026-10-16T20:00:00Z"))).toBe("2026-10-17");
    expect(istDay(new Date("2026-10-16T12:00:00Z"))).toBe("2026-10-16");
    expect(istDay(new Date("2026-10-16T18:29:59Z"))).toBe("2026-10-16");
  });
});

describe("quantity and platform fee", () => {
  it("derives the quantity from amount and price with 8 decimals", () => {
    expect(quantityFor(45000, 106.9)).toBe(420.95416277);
    expect(quantityFor(45000, 0)).toBe(0);
  });
  it("charges the wallet fee only when the wallet has it on", () => {
    expect(platformFeeFor(420.95416277, { id: "w", name: "X", feePercentage: 0.1, feeEnabled: true })).toEqual({ percentage: 0.1, amount: 0.420954 });
    expect(platformFeeFor(420.95416277, { id: "w", name: "X", feePercentage: 0.1, feeEnabled: false })).toEqual({ percentage: 0, amount: 0 });
    expect(platformFeeFor(420.95416277, { id: "w", name: "X", feePercentage: 0, feeEnabled: true })).toEqual({ percentage: 0, amount: 0 });
  });
});

describe("buildNewOrderRpcArgs", () => {
  const base: NewOrderInput = {
    orderNumber: " ORD-TEST-0001 ",
    clientId: "c0000000-0000-4000-8000-000000000001",
    clientName: "TEST BUYER",
    clientPhone: "9000000101",
    clientState: "Kerala",
    riskLevel: "STANDARD",
    cosmosAlert: false,
    amount: 45000,
    pricePerUnit: 106.9,
    product: { id: "p-usdt", code: "USDT" },
    wallet: { id: "w-1", name: "BINANCE TEST", feePercentage: 0, feeEnabled: true },
    paymentMethod: { id: "spm-direct", payment_gateway: false },
    marketRateUsdt: 1,
    description: "  note ",
    createdBy: "u0000000-0000-4000-8000-000000000001",
    orderDate: "2026-10-16",
  };

  it("writes a completed manual-style order: only real columns, client by id, IST day, direct settlement", () => {
    const { p_order, p_steps } = buildNewOrderRpcArgs(base);
    expect(Object.keys(p_order).every((k) => SALES_ORDER_COLUMNS.includes(k))).toBe(true);
    for (const banned of ["platform_fees", "warehouse_id", "usdt_amount", "source", "sale_type", "terminal_sync_id"]) {
      expect(p_order).not.toHaveProperty(banned);
    }
    expect(p_order).toEqual({
      order_number: "ORD-TEST-0001",
      client_id: "c0000000-0000-4000-8000-000000000001",
      client_name: "TEST BUYER",
      client_phone: "9000000101",
      client_state: "Kerala",
      product_id: "p-usdt",
      wallet_id: "w-1",
      platform: "BINANCE",
      quantity: 420.95416277,
      price_per_unit: 106.9,
      total_amount: 45000,
      sales_payment_method_id: "spm-direct",
      payment_status: "COMPLETED",
      status: "COMPLETED",
      settlement_status: "DIRECT",
      order_date: "2026-10-16",
      description: "note",
      is_off_market: false,
      is_split_payment: false,
      fee_amount: 0,
      fee_percentage: 0,
      market_rate_usdt: 1,
      effective_usdt_qty: 420.95416277,
      effective_usdt_rate: 45000 / 420.95416277,
      cosmos_alert: false,
      risk_level: "STANDARD",
      created_by: "u0000000-0000-4000-8000-000000000001",
    });
    expect(p_steps).toEqual([{ op: "wallet_deduction", wallet_id: "w-1", amount: 420.95416277, asset_code: "USDT" }]);
  });

  it("debits a non-USDT product in its own asset and values it at the locked market rate", () => {
    const { p_order, p_steps } = buildNewOrderRpcArgs({ ...base, amount: 70000, pricePerUnit: 7000000, product: { id: "p-btc", code: "btc" }, marketRateUsdt: 72100 });
    expect(p_order.quantity).toBe(0.01);
    expect(p_order.market_rate_usdt).toBe(72100);
    expect(p_order.effective_usdt_qty).toBeCloseTo(721, 6);
    expect(p_steps).toEqual([{ op: "wallet_deduction", wallet_id: "w-1", amount: 0.01, asset_code: "BTC" }]);
  });

  it("leaves a gateway sale PENDING for settlement", () => {
    const { p_order } = buildNewOrderRpcArgs({ ...base, paymentMethod: { id: "spm-gw", payment_gateway: true } });
    expect(p_order.settlement_status).toBe("PENDING");
  });

  it("adds the platform fee step and stores fee amount and percentage when the wallet charges a fee", () => {
    const { p_order, p_steps } = buildNewOrderRpcArgs({ ...base, wallet: { id: "w-1", name: "BINANCE TEST", feePercentage: 0.1, feeEnabled: true } });
    expect(p_order.fee_amount).toBe(0.420954);
    expect(p_order.fee_percentage).toBe(0.1);
    expect(p_steps).toEqual([
      { op: "wallet_deduction", wallet_id: "w-1", amount: 420.95416277, asset_code: "USDT" },
      { op: "platform_fee", wallet_id: "w-1", fee_amount: 0.420954 },
    ]);
  });

  it("sends no client id for a new client and keeps empty optional fields null", () => {
    const { p_order } = buildNewOrderRpcArgs({ ...base, clientId: null, clientPhone: "", clientState: null, description: " ", riskLevel: "HIGH_RISK", cosmosAlert: true });
    expect(p_order.client_id).toBeNull();
    expect(p_order.client_phone).toBeNull();
    expect(p_order.client_state).toBeNull();
    expect(p_order.description).toBeNull();
    expect(p_order.cosmos_alert).toBe(true);
  });
});

describe("newOrderErrorMessage", () => {
  it("explains what happened and what to do", () => {
    expect(newOrderErrorMessage({ message: 'duplicate key value violates unique constraint "sales_orders_order_number_key"' })).toMatch(/already used.*Enter a different order number/);
    expect(newOrderErrorMessage({ message: "Insufficient wallet balance. Available: 10.0000, Required: 420.5000" })).toBe(
      "Insufficient wallet balance. Available: 10.0000, Required: 420.5000. Nothing was saved. Pick another wallet or lower the amount.",
    );
    expect(newOrderErrorMessage({ message: 'new row violates row-level security policy for table "sales_orders"' })).toMatch(/permission/);
    expect(newOrderErrorMessage({ message: "Sales orders have no field(s) platform_fees, so nothing was saved." })).toBe("Sales orders have no field(s) platform_fees, so nothing was saved.");
    expect(newOrderErrorMessage(new Error("Market price unavailable for BTC. Cannot proceed without a valid USDT rate."))).toBe(
      "Market price unavailable for BTC. Cannot proceed without a valid USDT rate. Nothing was saved. Check the details and try again.",
    );
  });
});

describe("the period a receiving account's limit covers", () => {
  // 24 Oct 2026, 02:30 IST (= 23 Oct 21:00 UTC).
  const now = new Date("2026-10-23T21:00:00Z");

  it("Daily counts from 00:00 IST today", () => {
    expect(usageWindowStart({ frequency: "Daily", last_reset: "2026-02-12T10:00:00Z" }, now)).toBe("2026-10-23T18:30:00.000Z");
  });
  it("24 hours counts the last 24 hours", () => {
    expect(usageWindowStart({ frequency: "24 hours", last_reset: "2025-09-12T00:00:00Z" }, now)).toBe("2026-10-22T21:00:00.000Z");
  });
  it("a reset inside the period starts it later", () => {
    expect(usageWindowStart({ frequency: "Daily", last_reset: "2026-10-23T20:00:00Z" }, now)).toBe("2026-10-23T20:00:00.000Z");
  });
  it("any other frequency counts from the last reset, as before", () => {
    expect(usageWindowStart({ frequency: "Custom", last_reset: "2026-03-01T00:00:00Z" }, now)).toBe("2026-03-01T00:00:00.000Z");
    expect(usageWindowStart({ frequency: null, last_reset: null }, now)).toBeNull();
  });

  it("direct accounts are measured over their period, gateways by their pending settlements", async () => {
    usage.compute.mockReset();
    usage.compute.mockResolvedValue(1234);
    const rows = await withLiveSalesUsage([
      { id: "direct", frequency: "Daily", last_reset: "2026-02-12T10:00:00Z", payment_gateway: false },
      { id: "gateway", frequency: "Daily", last_reset: "2026-02-12T10:00:00Z", payment_gateway: true },
    ], now);
    expect(usage.compute).toHaveBeenCalledWith("direct", "2026-10-23T18:30:00.000Z", false);
    expect(usage.compute).toHaveBeenCalledWith("gateway", null, true);
    expect(rows.map((r) => r.current_usage)).toEqual([1234, 1234]);
  });
});
