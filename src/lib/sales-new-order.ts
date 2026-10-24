/**
 * Helpers for the Sales page "New order" flow (StepBySalesFlow): which receiving accounts a client may be
 * offered, and the exact order + postings sent to create_sales_order_with_postings. All pure and covered by
 * sales-new-order.test.ts, except withLiveSalesUsage, which loads payment-method-usage only when called.
 */

/** sales_payment_methods.risk_category values. */
export type SalesRiskCategory = "No Risk" | "Low Risk" | "Medium Risk" | "High Risk";

/**
 * Client risk appetite (clients.risk_appetite) → the payment-method risk category the client may pay into.
 * Current values first, then the legacy ones; anything unknown is treated as High Risk.
 */
const RISK_CATEGORY_BY_APPETITE: Record<string, SalesRiskCategory> = {
  PREMIUM: "No Risk",
  ESTABLISHED: "Low Risk",
  STANDARD: "Medium Risk",
  CAUTIOUS: "High Risk",
  HIGH_RISK: "High Risk",
  NONE: "No Risk",
  LOW: "Low Risk",
  MEDIUM: "Medium Risk",
  HIGH: "High Risk",
};

export function riskCategoryForAppetite(appetite: string | null | undefined): SalesRiskCategory {
  return RISK_CATEGORY_BY_APPETITE[String(appetite ?? "").trim().toUpperCase()] ?? "High Risk";
}

type MethodLike = {
  id: string;
  type?: string | null;
  payment_limit?: number | string | null;
  bank_accounts?: { status?: string | null } | null;
};

/**
 * A receiving account can be offered when its bank account is active and its live usage is below its limit.
 * Usage comes from computeSalesPaymentMethodUsage (orders / pending settlements): the stored current_usage
 * column is not maintained.
 */
export function isMethodAvailable(method: MethodLike, usage: number): boolean {
  return method.bank_accounts?.status === "ACTIVE" && Number(usage || 0) < Number(method.payment_limit || 0);
}

/**
 * Start of the period a direct account's limit covers, from its own frequency setting: "Daily" is today in
 * India (from 00:00 IST), "24 hours" is the last 24 hours. A reset inside that period starts it later. Any
 * other frequency (e.g. Custom) counts from the last reset, as before. Without this, usage would be every
 * order since the account was created, because nothing moves last_reset forward.
 */
export function usageWindowStart(
  method: { frequency?: string | null; last_reset?: string | null },
  now: Date = new Date(),
): string | null {
  const frequency = String(method.frequency ?? "").trim().toLowerCase();
  let start: Date | null = null;
  if (frequency === "daily") start = new Date(`${istDay(now)}T00:00:00+05:30`);
  else if (frequency === "24 hours") start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const reset = method.last_reset ? new Date(method.last_reset) : null;
  const validReset = reset && !Number.isNaN(reset.getTime()) ? reset : null;
  if (!start) return validReset ? validReset.toISOString() : null;
  return (validReset && validReset > start ? validReset : start).toISOString();
}

/**
 * The methods with current_usage replaced by the live figure from computeSalesPaymentMethodUsage (gateway:
 * its pending settlements; direct: its orders inside the limit's period, see usageWindowStart). Nothing
 * maintains the stored column.
 */
export async function withLiveSalesUsage<T extends { id: string; last_reset?: string | null; frequency?: string | null; payment_gateway?: boolean | null }>(
  methods: T[],
  now: Date = new Date(),
): Promise<Array<T & { current_usage: number }>> {
  const { computeSalesPaymentMethodUsage } = await import("@/lib/payment-method-usage");
  return Promise.all(
    methods.map(async (m) => ({
      ...m,
      current_usage: await computeSalesPaymentMethodUsage(
        m.id,
        m.payment_gateway ? null : usageWindowStart(m, now),
        Boolean(m.payment_gateway),
      ),
    })),
  );
}

/** Room left under the limit (never negative). */
export function methodRoom(method: MethodLike, usage: number): number {
  return Math.max(0, Number(method.payment_limit || 0) - Number(usage || 0));
}

/** Auto-select: UPI first (fastest), then the available account with the most room left. */
export function pickAutoMethod<T extends MethodLike>(methods: T[], usageOf: (method: T) => number): T | null {
  const open = methods.filter((m) => isMethodAvailable(m, usageOf(m)));
  const most = (list: T[]) => list.reduce((best, m) => (methodRoom(m, usageOf(m)) > methodRoom(best, usageOf(best)) ? m : best));
  const upi = open.filter((m) => m.type === "UPI");
  if (upi.length) return most(upi);
  const bank = open.filter((m) => m.type === "Bank Account");
  return bank.length ? most(bank) : null;
}

/** The calendar day in India (YYYY-MM-DD), as the Terminal approvals store order_date. */
export function istDay(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export type NewOrderInput = {
  orderNumber: string;
  /** Repeat client: the selected client's id. New client: null (never looked up by name). */
  clientId: string | null;
  /** Stored as given (a repeat client's name exactly as on the client record). */
  clientName: string;
  clientPhone?: string | null;
  clientState?: string | null;
  riskLevel?: string | null;
  cosmosAlert: boolean;
  /** Order amount in INR. */
  amount: number;
  pricePerUnit: number;
  product: { id: string; code: string | null };
  /** Fee fields as read from wallets (fee_percentage, is_fee_enabled); coerced here. */
  wallet: { id: string; name: string | null; feePercentage?: unknown; feeEnabled?: unknown };
  paymentMethod: { id: string; payment_gateway: boolean | null };
  /** USDT price of one unit of the product, from fetchAndLockMarketRate (1 for USDT). */
  marketRateUsdt: number;
  description?: string | null;
  createdBy: string;
  orderDate: string;
};

export type NewOrderRpcArgs = {
  p_order: Record<string, unknown>;
  p_steps: Array<Record<string, unknown>>;
};

/** Quantity sold: amount ÷ price, 8 decimals, as Manual entry derives it from total and price. */
export function quantityFor(amount: number, pricePerUnit: number): number {
  return pricePerUnit > 0 && amount > 0 ? Number((amount / pricePerUnit).toFixed(8)) : 0;
}

/** Platform fee the way Manual entry charges it: wallet fee % of the quantity, only when the wallet's fee is on. */
export function platformFeeFor(quantity: number, wallet: NewOrderInput["wallet"]): { percentage: number; amount: number } {
  const percentage = wallet.feeEnabled ? Number(wallet.feePercentage || 0) : 0;
  if (!(percentage > 0) || !(quantity > 0)) return { percentage: 0, amount: 0 };
  return { percentage, amount: Number(((quantity * percentage) / 100).toFixed(6)) };
}

/**
 * The order row and the postings for create_sales_order_with_postings, matching a Manual entry sale:
 * the bank INCOME (direct method), the pending settlement (gateway method) and the stock row are written by
 * the sales_orders INSERT triggers, so they are not steps here. The wallet is debited the sold quantity in the
 * product's own asset, then the platform fee (USDT) when the wallet charges one.
 */
export function buildNewOrderRpcArgs(input: NewOrderInput): NewOrderRpcArgs {
  const quantity = quantityFor(input.amount, input.pricePerUnit);
  const fee = platformFeeFor(quantity, input.wallet);
  const assetCode = String(input.product.code || "USDT").trim().toUpperCase() || "USDT";
  const rate = input.marketRateUsdt > 0 ? input.marketRateUsdt : 1;
  const effectiveQty = quantity * rate;
  const platform = String(input.wallet.name || "").trim().split(/\s+/)[0] || null;

  const p_order: Record<string, unknown> = {
    order_number: input.orderNumber.trim(),
    client_id: input.clientId,
    client_name: input.clientName,
    client_phone: input.clientPhone?.trim() || null,
    client_state: input.clientState?.trim() || null,
    product_id: input.product.id,
    wallet_id: input.wallet.id,
    platform,
    quantity,
    price_per_unit: input.pricePerUnit,
    total_amount: input.amount,
    sales_payment_method_id: input.paymentMethod.id,
    payment_status: "COMPLETED",
    status: "COMPLETED",
    settlement_status: input.paymentMethod.payment_gateway ? "PENDING" : "DIRECT",
    order_date: input.orderDate,
    description: input.description?.trim() || null,
    is_off_market: false,
    is_split_payment: false,
    fee_amount: fee.amount,
    fee_percentage: fee.percentage,
    market_rate_usdt: input.marketRateUsdt > 0 ? input.marketRateUsdt : null,
    effective_usdt_qty: effectiveQty,
    effective_usdt_rate: effectiveQty > 0 ? input.amount / effectiveQty : null,
    cosmos_alert: input.cosmosAlert,
    risk_level: input.riskLevel || null,
    created_by: input.createdBy,
  };

  const p_steps: Array<Record<string, unknown>> = [
    { op: "wallet_deduction", wallet_id: input.wallet.id, amount: quantity, asset_code: assetCode },
  ];
  if (fee.amount > 0) p_steps.push({ op: "platform_fee", wallet_id: input.wallet.id, fee_amount: fee.amount });

  return { p_order, p_steps };
}

/** Plain-language message for a failed save, with what to do next. */
export function newOrderErrorMessage(error: unknown): string {
  const raw = String((error as { message?: string })?.message || error || "")
    .trim()
    .replace(/\.$/, "");
  if (/sales_orders_order_number_key|duplicate key.*order_number/i.test(raw)) {
    return "This order number is already used by another sale. Nothing was saved. Enter a different order number and try again.";
  }
  if (/row-level security|permission denied/i.test(raw)) {
    return "You don't have permission to create sales orders. Nothing was saved. Ask an admin for Sales access.";
  }
  if (/nothing was saved/i.test(raw)) return `${raw}.`;
  if (/insufficient/i.test(raw)) return `${raw}. Nothing was saved. Pick another wallet or lower the amount.`;
  return raw ? `${raw}. Nothing was saved. Check the details and try again.` : "The order could not be saved. Nothing was saved. Try again.";
}
