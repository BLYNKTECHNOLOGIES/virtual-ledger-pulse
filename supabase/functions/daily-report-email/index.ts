import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RECIPIENTS = ["Shubham.singh@blynkex.com", "abhisheksingh@blynkex.com"];

// Copper / amber palette
const COPPER = "#B87333";
const COPPER_DARK = "#8C5A2B";
const AMBER = "#C77B3B";
const GREEN = "#2E7D32";
const RED = "#C62828";

// ---------- helpers ----------

// Returns the previous IST calendar day as YYYY-MM-DD
function previousIstDate(): string {
  const now = new Date();
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  ist.setUTCDate(ist.getUTCDate() - 1);
  return ist.toISOString().split("T")[0];
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

// Convert a UTC timestamptz string to IST hour (0-23)
function istHour(ts: string): number {
  const d = new Date(ts);
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).getUTCHours();
}

// Convert a UTC timestamptz string to its IST calendar date (YYYY-MM-DD)
function istDateStr(ts?: string | null): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().split("T")[0];
}

// ---------- KYC / Buyer-client onboarding summary (low-priority bottom section) ----------
// `client_onboarding_approvals` is the buyer-side KYC approval ledger (every row is
// created from a sales order, i.e. a client BUYING crypto from us). Sellers go through
// purchase orders and never create rows here, so this table is buyer-only by design.
async function buildKyc(supabase: any, date: string) {
  const rows = await fetchAllRows(() =>
    supabase
      .from("client_onboarding_approvals")
      .select("client_phone, client_name, reviewed_at, approval_status"));

  // ---- Pending & Approved: dedup by lowercased trimmed client name, EXACTLY
  // matching the ERP "Client Onboarding Approvals" screen (which groups pending
  // rows by client name). This keeps the email number identical to the ERP UI.
  const nameKey = (r: any): string => String(r.client_name || "").trim().toLowerCase();

  const approvedSet = new Set<string>();   // distinct buyer clients approved on report date
  const pendingSet = new Set<string>();     // distinct buyer clients currently pending
  for (const r of rows) {
    const k = nameKey(r);
    if (!k) continue;
    if (r.approval_status === "APPROVED" && istDateStr(r.reviewed_at) === date) approvedSet.add(k);
    if (r.approval_status === "PENDING") pendingSet.add(k);
  }

  // ---- New Buyer Clients: clients who bought from us (sales orders = buyer side)
  // for the VERY FIRST TIME on the report date. A client who has any earlier sales
  // order — or who was already pending/approved from a previous day — is NOT new.
  // Source of truth is sales_orders (buyers), not the approval ledger.
  const salesRows = await fetchAllRows(() =>
    supabase.from("sales_orders").select("client_name, created_at"));
  const firstSale = new Map<string, string>();
  for (const s of salesRows) {
    const k = String(s.client_name || "").trim().toLowerCase();
    if (!k) continue;
    const d = istDateStr(s.created_at);
    if (!d) continue;
    const prev = firstSale.get(k);
    if (!prev || d < prev) firstSale.set(k, d);
  }
  let newClients = 0;
  for (const d of firstSale.values()) if (d === date) newClients += 1;

  return {
    newClients,
    approvedToday: approvedSet.size,
    pendingTotal: pendingSet.size,
  };
}


// Terminal shift windows (IST, non-overlapping, derived from hr_shifts start times):
//   Morning 09:00–17:00, Evening 17:00–01:00, Night 01:00–09:00
type ShiftKey = "morning" | "evening" | "night";
function shiftOf(hour: number): ShiftKey {
  if (hour >= 9 && hour < 17) return "morning";
  if (hour >= 1 && hour < 9) return "night";
  return "evening"; // hours 17–23 and 00
}
const SHIFT_META: Record<ShiftKey, { label: string; window: string }> = {
  morning: { label: "Morning Shift", window: "09:00 – 17:00 IST" },
  evening: { label: "Evening Shift", window: "17:00 – 01:00 IST" },
  night: { label: "Night Shift", window: "01:00 – 09:00 IST" },
};

// Normalize messy platform strings into clean, consistent labels.
function normalizePlatform(raw?: string | null): string {
  const s = String(raw || "").trim();
  if (!s) return "Unspecified";
  const u = s.toUpperCase();
  if (u === "BINANCE") return "Binance";
  if (u === "BINANCE BLYNK") return "Binance (Blynk)";
  if (u === "BINANCE ASEC") return "Binance (ASEC)";
  if (u === "KUCOIN") return "KuCoin";
  if (u === "BITGET") return "Bitget";
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Map a wallet name (e.g. "BINANCE BLYNK", "KUCOIN ") to a clean platform label.
// This is the source of truth for attributing manual / unspecified orders to the
// exchange wallet that was actually used for them.
function walletPlatformLabel(name?: string | null): string {
  const u = String(name || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!u) return "Unspecified";
  const MAP: Record<string, string> = {
    "BINANCE BLYNK": "Binance (Blynk)",
    "BINANCE ASEC": "Binance (ASEC)",
    "BINANCE AS": "Binance (AS)",
    "BINANCE SS": "Binance (SS)",
    "BYBIT BLYNK": "Bybit (Blynk)",
    "BYBIT AS": "Bybit (AS)",
    "COIN EX BLYNK": "CoinEx (Blynk)",
    "KUCOIN": "KuCoin",
    "BITGET": "Bitget",
    "CREDIT STOCK": "Credit Stock",
  };
  if (MAP[u]) return MAP[u];
  return u.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}


async function fetchAll(supabase: any, table: string, columns: string, date: string) {
  const pageSize = 1000;
  let from = 0;
  const out: any[] = [];
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("order_date", date)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

const fmtNum = (n: number, dp = 2) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });

function quickChart(config: Record<string, unknown>): string {
  const json = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?bkg=white&w=560&h=300&c=${json}`;
}

// ---------- Total Asset Value (mirrors the Financials tab widget exactly) ----------

// Audit/contra buckets excluded from all financial aggregations
const ADJ_BANK_NAMES = ["balance adjustment account"];
const ADJ_WALLET_NAMES = ["balance adjustment wallet"];
const isAdjBank = (n?: string | null) => !!n && ADJ_BANK_NAMES.includes(String(n).trim().toLowerCase());
const isAdjWallet = (n?: string | null) => !!n && ADJ_WALLET_NAMES.includes(String(n).trim().toLowerCase());

// Generic paginated fetch (>1000 rows safe)
async function fetchAllRows(builder: () => any): Promise<any[]> {
  const pageSize = 1000;
  let from = 0;
  const out: any[] = [];
  while (true) {
    const { data, error } = await builder().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function buildAssetValue(supabase: any) {
  // 1. Bank balances (Active + Dormant), excluding adjustment bucket
  const { data: banks } = await supabase
    .from("bank_accounts")
    .select("account_name, bank_name, balance, status")
    .in("status", ["ACTIVE", "DORMANT"])
    .order("account_name");
  const bankDetails = (banks || [])
    .filter((b: any) => !isAdjBank(b.account_name))
    .map((b: any) => ({ account_name: b.account_name, bank_name: b.bank_name, balance: Number(b.balance || 0) }));
  const totalBank = bankDetails.reduce((s: number, a: any) => s + a.balance, 0);

  // 2. POS / Gateway — pending settlements grouped by gateway
  const pendingSettlements = await fetchAllRows(() =>
    supabase.from("pending_settlements").select("settlement_amount, payment_method_id").eq("status", "PENDING"));
  const pmIds = [...new Set(pendingSettlements.map((p: any) => p.payment_method_id).filter(Boolean))];
  const pmNameMap = new Map<string, string>();
  if (pmIds.length) {
    const { data: pms } = await supabase.from("sales_payment_methods").select("id, type, nickname").in("id", pmIds);
    (pms || []).forEach((pm: any) => pmNameMap.set(pm.id, pm.nickname || pm.type || "Unknown"));
  }
  const gwMap = new Map<string, { total: number; count: number }>();
  pendingSettlements.forEach((p: any) => {
    const name = p.payment_method_id ? (pmNameMap.get(p.payment_method_id) || "Unknown Gateway") : "Unassigned";
    const e = gwMap.get(name) || { total: 0, count: 0 };
    e.total += Number(p.settlement_amount || 0);
    e.count += 1;
    gwMap.set(name, e);
  });
  const gatewayGroups = Array.from(gwMap.entries())
    .map(([gateway_name, v]) => ({ gateway_name, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total);
  const totalGateway = gatewayGroups.reduce((s, g) => s + g.total, 0);

  // 3. Stock valuation — multi-asset
  // 3a. USDT from ledger (wallet_asset_balances) falling back to wallets.current_balance
  const [{ data: wallets }, usdtRows] = await Promise.all([
    supabase.from("wallets").select("id, wallet_name, current_balance").eq("is_active", true),
    fetchAllRows(() => supabase.from("wallet_asset_balances").select("wallet_id, balance").eq("asset_code", "USDT")),
  ]);
  const usdtMap = new Map(usdtRows.map((r: any) => [r.wallet_id, Number(r.balance || 0)]));
  const totalUsdtUnits = (wallets || [])
    .filter((w: any) => !isAdjWallet(w.wallet_name))
    .reduce((s: number, w: any) => s + (usdtMap.has(w.id) ? Number(usdtMap.get(w.id)) : Number(w.current_balance || 0)), 0);

  // 3b. Non-USDT asset balances
  const assetBalances = await fetchAllRows(() =>
    supabase.from("wallet_asset_balances").select("asset_code, balance").neq("asset_code", "USDT"));
  const nonUsdtMap = new Map<string, number>();
  assetBalances.forEach((ab: any) => {
    nonUsdtMap.set(ab.asset_code, (nonUsdtMap.get(ab.asset_code) || 0) + Number(ab.balance || 0));
  });

  // 3c. Avg cost per product from completed POs
  const purchaseOrders = await fetchAllRows(() =>
    supabase.from("purchase_orders").select(`*, purchase_order_items(quantity, total_price, products(code))`).eq("status", "COMPLETED"));
  const costCalc = new Map<string, { qty: number; cost: number }>();
  purchaseOrders.forEach((po: any) => {
    (po.purchase_order_items || []).forEach((item: any) => {
      const code = item.products?.code;
      if (!code) return;
      const e = costCalc.get(code) || { qty: 0, cost: 0 };
      e.qty += Number(item.quantity || 0);
      e.cost += Number(item.total_price || 0);
      costCalc.set(code, e);
    });
  });
  const getAvgCost = (code: string) => {
    const c = costCalc.get(code);
    return c && c.qty > 0 ? c.cost / c.qty : 0;
  };

  const assetStocks: { asset_code: string; total_units: number; avg_cost: number; total_value: number }[] = [];
  const usdtAvg = getAvgCost("USDT");
  if (totalUsdtUnits > 0 || usdtAvg > 0) {
    assetStocks.push({ asset_code: "USDT", total_units: totalUsdtUnits, avg_cost: usdtAvg, total_value: totalUsdtUnits * usdtAvg });
  }
  nonUsdtMap.forEach((units, code) => {
    const avg = getAvgCost(code);
    if (units > 0) assetStocks.push({ asset_code: code, total_units: units, avg_cost: avg, total_value: units * avg });
  });
  assetStocks.sort((a, b) => b.total_value - a.total_value);
  const stockVal = assetStocks.reduce((s, a) => s + a.total_value, 0);

  // 4. Unpaid TDS liability
  const unpaidTds = await fetchAllRows(() =>
    supabase.from("tds_records").select("tds_amount").or("payment_status.is.null,payment_status.neq.PAID"));
  const totalUnpaidTds = unpaidTds.reduce((s: number, r: any) => s + Number(r.tds_amount || 0), 0);

  const total = totalBank + totalGateway + stockVal - totalUnpaidTds;
  return {
    total, totalBank, totalGateway, stockVal, totalUnpaidTds,
    bankCount: bankDetails.length, gatewayGroups, assetStocks,
    tdsCount: unpaidTds.length, pendingCount: pendingSettlements.length,
  };
}

// ---------- Rejected ERP entries (audit) ----------
// Lists every ERP transactional entry that was REJECTED on the report's IST day.
// Audit-complete: nothing is filtered beyond the date scope. Sources mirror the
// ERP "Rejected" feed (useErpEntryRejectedFeed) minus buyer-KYC onboarding.
function fmtRejAmount(n: number, asset: string): string {
  if (!isFinite(n)) return `${n} ${asset}`;
  const abs = Math.abs(n);
  const decimals = abs >= 1 ? 2 : 6;
  return `${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: decimals })} ${asset}`;
}

function fmtRejTime(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} IST`;
}

async function buildRejected(supabase: any, date: string) {
  const [
    actionQueueRes,
    terminalBuyRes,
    terminalSaleRes,
    smallBuysRes,
    smallSalesRes,
    conversionRes,
  ] = await Promise.all([
    fetchAllRows(() =>
      supabase.from("erp_action_queue").select("*").eq("status", "REJECTED")),
    fetchAllRows(() =>
      supabase.from("terminal_purchase_sync").select("*").eq("sync_status", "rejected")),
    fetchAllRows(() =>
      supabase.from("terminal_sales_sync").select("*").eq("sync_status", "rejected")),
    fetchAllRows(() =>
      supabase.from("small_buys_sync").select("*").eq("sync_status", "rejected")),
    fetchAllRows(() =>
      supabase.from("small_sales_sync").select("*").eq("sync_status", "rejected")),
    fetchAllRows(() =>
      supabase.from("erp_product_conversions").select("*").eq("status", "REJECTED")),
  ]);

  interface RejRow {
    type: string;
    label: string;
    amount: string;
    counterparty: string;
    reason: string;
    rejectedByRaw: string | null; // UUID or pre-resolved name
    rejectedByName?: string | null;
    rejectedAt: string | null;
    rejectedTs: number;
  }

  const rows: RejRow[] = [];

  // erp_action_queue (deposits / withdrawals)
  for (const r of actionQueueRes) {
    const at = r.processed_at || r.updated_at || null;
    if (istDateStr(at) !== date) continue;
    const isDeposit = r.movement_type === "deposit";
    const amount = Number(r.amount || 0);
    rows.push({
      type: isDeposit ? "Deposit" : "Withdrawal",
      label: `${isDeposit ? "Deposit" : "Withdrawal"} · ${r.asset || ""}`.trim(),
      amount: fmtRejAmount(amount, r.asset || ""),
      counterparty: [r.network, r.tx_id ? `${String(r.tx_id).slice(0, 10)}…` : null].filter(Boolean).join(" · ") || "Binance movement",
      reason: r.reject_reason || r.rejection_reason || "—",
      rejectedByRaw: r.processed_by || null,
      rejectedAt: at,
      rejectedTs: at ? new Date(at).getTime() : 0,
    });
  }

  // terminal buys
  for (const r of terminalBuyRes) {
    const at = r.reviewed_at || r.updated_at || r.synced_at || null;
    if (istDateStr(at) !== date) continue;
    const od = r.order_data || {};
    const qty = parseFloat(od.amount || "0");
    const asset = String(od.asset || "USDT").toUpperCase();
    rows.push({
      type: "Terminal Buy",
      label: r.binance_order_number ? `Order ${r.binance_order_number}` : "Terminal Buy",
      amount: fmtRejAmount(qty, asset),
      counterparty: [od.pay_method, r.counterparty_name].filter(Boolean).join(" · ") || "—",
      reason: r.rejection_reason || "—",
      rejectedByRaw: r.reviewed_by || null,
      rejectedAt: at,
      rejectedTs: at ? new Date(at).getTime() : 0,
    });
  }

  // terminal sales
  for (const r of terminalSaleRes) {
    const at = r.reviewed_at || r.updated_at || r.synced_at || null;
    if (istDateStr(at) !== date) continue;
    const od = r.order_data || {};
    const qty = parseFloat(od.amount || "0");
    const asset = String(od.asset || "USDT").toUpperCase();
    rows.push({
      type: "Terminal Sale",
      label: r.binance_order_number ? `Order ${r.binance_order_number}` : "Terminal Sale",
      amount: fmtRejAmount(qty, asset),
      counterparty: [od.pay_method, r.counterparty_name].filter(Boolean).join(" · ") || "—",
      reason: r.rejection_reason || "—",
      rejectedByRaw: r.reviewed_by || null,
      rejectedAt: at,
      rejectedTs: at ? new Date(at).getTime() : 0,
    });
  }

  // small buys batches
  for (const r of smallBuysRes) {
    const at = r.reviewed_at || r.updated_at || null;
    if (istDateStr(at) !== date) continue;
    const asset = r.asset_code || "USDT";
    const qty = Number(r.total_quantity || 0);
    rows.push({
      type: "Small Buys",
      label: `Batch · ${r.order_count || 0} orders`,
      amount: fmtRejAmount(qty, asset),
      counterparty: r.sync_batch_id || "—",
      reason: r.rejection_reason || "—",
      rejectedByRaw: r.reviewed_by || null,
      rejectedAt: at,
      rejectedTs: at ? new Date(at).getTime() : 0,
    });
  }

  // small sales batches
  for (const r of smallSalesRes) {
    const at = r.reviewed_at || r.updated_at || null;
    if (istDateStr(at) !== date) continue;
    const asset = r.asset_code || "USDT";
    const qty = Number(r.total_quantity || 0);
    rows.push({
      type: "Small Sales",
      label: `Batch · ${r.order_count || 0} orders`,
      amount: fmtRejAmount(qty, asset),
      counterparty: r.sync_batch_id || "—",
      reason: r.rejection_reason || "—",
      rejectedByRaw: r.reviewed_by || null,
      rejectedAt: at,
      rejectedTs: at ? new Date(at).getTime() : 0,
    });
  }

  // conversions
  for (const r of conversionRes) {
    const at = r.rejected_at || null;
    if (istDateStr(at) !== date) continue;
    const asset = r.asset_code || "";
    const qty = Number(r.quantity || 0);
    rows.push({
      type: "Conversion",
      label: `${r.side || ""} ${r.reference_no || ""}`.trim() || "Conversion",
      amount: fmtRejAmount(qty, asset),
      counterparty: r.reference_no || "—",
      reason: r.rejection_reason || "—",
      rejectedByRaw: r.rejected_by || null,
      rejectedByName: r.rejected_by_name || null,
      rejectedAt: at,
      rejectedTs: at ? new Date(at).getTime() : 0,
    });
  }

  // Resolve rejecting-user UUIDs -> display names (batch)
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = Array.from(
    new Set(
      rows
        .filter((r) => !r.rejectedByName && r.rejectedByRaw && uuidRe.test(r.rejectedByRaw))
        .map((r) => r.rejectedByRaw as string),
    ),
  );
  const nameMap: Record<string, string> = {};
  if (ids.length) {
    const { data: users } = await supabase
      .from("users")
      .select("id, first_name, last_name, username")
      .in("id", ids);
    for (const u of users || []) {
      nameMap[u.id] = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "—";
    }
  }

  const outRows = rows
    .sort((a, b) => b.rejectedTs - a.rejectedTs)
    .map((r) => {
      let rejectedBy = r.rejectedByName || "—";
      if (rejectedBy === "—" && r.rejectedByRaw) {
        rejectedBy = uuidRe.test(r.rejectedByRaw) ? (nameMap[r.rejectedByRaw] || "—") : r.rejectedByRaw;
      }
      return {
        type: r.type,
        label: r.label || "—",
        amount: r.amount,
        counterparty: r.counterparty || "—",
        reason: r.reason || "—",
        rejectedBy,
        rejectedAt: fmtRejTime(r.rejectedAt),
      };
    });

  return { count: outRows.length, rows: outRows };
}

// ---------- aggregation ----------

async function buildReport(supabase: any, date: string) {
  const prevDate = shiftDate(date, -1);

  // Total Asset Value snapshot (current, mirrors the Financials tab widget)
  const av = await buildAssetValue(supabase);

  // Buyer-client KYC onboarding summary (low-priority section, shown at the bottom)
  const kyc = await buildKyc(supabase, date);

  // Rejected ERP entries on the report day (audit section, at the very bottom)
  const rejected = await buildRejected(supabase, date);

  // Sales + purchases for the day and the previous day (for comparison)
  const [salesRaw, purchasesRaw, salesPrevRaw, purchasesPrevRaw] = await Promise.all([
    fetchAll(supabase, "sales_orders", "id, quantity, price_per_unit, total_amount, status, product_id, client_name, created_at, effective_usdt_qty, effective_usdt_rate, platform, source, wallet_id", date),
    fetchAll(supabase, "purchase_orders", "id, quantity, price_per_unit, total_amount, status, product_name, supplier_name, created_at, effective_usdt_qty, effective_usdt_rate, source, wallet_id", date),
    fetchAll(supabase, "sales_orders", "id, total_amount, status, effective_usdt_qty, effective_usdt_rate, quantity", prevDate),
    fetchAll(supabase, "purchase_orders", "id, total_amount, status, effective_usdt_qty", prevDate),
  ]);

  // product id -> name map for sales asset breakdown
  const productIds = Array.from(new Set(salesRaw.map((s: any) => s.product_id).filter(Boolean)));
  const productMap: Record<string, string> = {};
  if (productIds.length) {
    const { data: prods } = await supabase.from("products").select("id, name").in("id", productIds);
    for (const p of prods || []) productMap[p.id] = p.name;
  }

  const salesCompleted = salesRaw.filter((o: any) => o.status === "COMPLETED");
  const purchasesCompleted = purchasesRaw.filter((o: any) => o.status === "COMPLETED");

  // ----- Sales aggregation -----
  let totalSalesQty = 0, totalSalesValue = 0;
  const salesByAsset: Record<string, { qty: number; value: number; count: number }> = {};
  for (const o of salesCompleted) {
    const qty = Number(o.effective_usdt_qty || o.quantity) || 0;
    const rate = Number(o.effective_usdt_rate || o.price_per_unit) || 0;
    const value = Number(o.total_amount) || qty * rate;
    totalSalesQty += qty;
    totalSalesValue += value;
    const asset = productMap[o.product_id] || "Unknown";
    if (!salesByAsset[asset]) salesByAsset[asset] = { qty: 0, value: 0, count: 0 };
    salesByAsset[asset].qty += qty;
    salesByAsset[asset].value += value;
    salesByAsset[asset].count += 1;
  }
  const avgSalesRate = totalSalesQty > 0 ? totalSalesValue / totalSalesQty : 0;

  // ----- Purchase aggregation -----
  let totalPurchaseQty = 0, totalPurchaseValue = 0;
  const purchaseByAsset: Record<string, { qty: number; value: number; count: number }> = {};
  for (const o of purchasesCompleted) {
    const effQty = Number(o.effective_usdt_qty) || 0;
    const totalAmt = Number(o.total_amount) || 0;
    if (effQty > 0) {
      totalPurchaseQty += effQty;
      totalPurchaseValue += totalAmt;
    }
    const asset = o.product_name || "Unknown";
    if (!purchaseByAsset[asset]) purchaseByAsset[asset] = { qty: 0, value: 0, count: 0 };
    purchaseByAsset[asset].qty += effQty;
    purchaseByAsset[asset].value += totalAmt;
    purchaseByAsset[asset].count += 1;
  }

  // ----- Platform-wise average rates -----
  // The wallet used on the order is the source of truth for platform attribution.
  // Resolve every order to its wallet's exchange label (so "manual" entries are
  // correctly attributed to KuCoin / Binance Blynk / etc. instead of "Manual").
  // Where a wallet isn't set, fall back to the order's platform string, then to
  // the terminal purchase-sync exchange account, then the order source.
  const EXCH_LABEL: Record<string, string> = {
    "00000000-0000-0000-0000-000000000001": "Binance (Blynk)",
    "00000000-0000-0000-0000-000000000002": "Binance (ASEC)",
  };

  // wallet_id -> clean platform label
  const { data: walletRows } = await supabase.from("wallets").select("id, wallet_name");
  const walletLabelMap = new Map<string, string>();
  for (const w of walletRows || []) {
    walletLabelMap.set(w.id, walletPlatformLabel(w.wallet_name));
  }

  // Terminal purchase-sync fallback for purchases without a wallet.
  const purIds = purchasesCompleted.map((o: any) => o.id);
  const purPlatformMap = new Map<string, string>();
  if (purIds.length) {
    const syncRows = await fetchAllRows(() =>
      supabase.from("terminal_purchase_sync").select("purchase_order_id, exchange_account_id").in("purchase_order_id", purIds));
    for (const r of syncRows) {
      if (r.purchase_order_id && r.exchange_account_id && EXCH_LABEL[r.exchange_account_id]) {
        purPlatformMap.set(r.purchase_order_id, EXCH_LABEL[r.exchange_account_id]);
      }
    }
  }

  const salesPlatformOf = (o: any): string => {
    if (o.wallet_id && walletLabelMap.has(o.wallet_id)) return walletLabelMap.get(o.wallet_id)!;
    if (o.platform) return normalizePlatform(o.platform);
    return "Unspecified";
  };
  const purchasePlatformOf = (o: any): string => {
    if (o.wallet_id && walletLabelMap.has(o.wallet_id)) return walletLabelMap.get(o.wallet_id)!;
    const mapped = purPlatformMap.get(o.id);
    if (mapped) return mapped;
    const src = String(o.source || "").toLowerCase();
    if (src.startsWith("terminal")) return "Terminal";
    return "Unspecified";
  };

  type PlatBucket = { buyQty: number; buyVal: number; buyCount: number; sellQty: number; sellVal: number; sellCount: number };
  const platAgg: Record<string, PlatBucket> = {};
  const ensurePlat = (name: string): PlatBucket => {
    if (!platAgg[name]) platAgg[name] = { buyQty: 0, buyVal: 0, buyCount: 0, sellQty: 0, sellVal: 0, sellCount: 0 };
    return platAgg[name];
  };
  for (const o of salesCompleted) {
    const qty = Number(o.effective_usdt_qty || o.quantity) || 0;
    const rate = Number(o.effective_usdt_rate || o.price_per_unit) || 0;
    const value = Number(o.total_amount) || qty * rate;
    const b = ensurePlat(salesPlatformOf(o));
    b.sellQty += qty; b.sellVal += value; b.sellCount += 1;
  }
  for (const o of purchasesCompleted) {
    const qty = Number(o.effective_usdt_qty) || 0;
    const value = Number(o.total_amount) || 0;
    const b = ensurePlat(purchasePlatformOf(o));
    b.buyQty += qty; b.buyVal += value; b.buyCount += 1;
  }
  const platformRates = Object.entries(platAgg)
    .map(([platform, a]) => ({
      platform,
      avgBuyRate: a.buyQty > 0 ? fmtNum(a.buyVal / a.buyQty, 4) : "—",
      buyCount: a.buyCount,
      avgSellRate: a.sellQty > 0 ? fmtNum(a.sellVal / a.sellQty, 4) : "—",
      sellCount: a.sellCount,
      _vol: a.buyVal + a.sellVal,
    }))
    .sort((a, b) => b._vol - a._vol)
    .map(({ _vol, ...rest }) => rest);

  // ----- Shift-wise breakdown (Morning / Evening / Night, IST terminal shifts) -----
  type ShiftBucket = { purQty: number; purVal: number; purCount: number; salQty: number; salVal: number; salCount: number };
  const shiftAgg: Record<ShiftKey, ShiftBucket> = {
    morning: { purQty: 0, purVal: 0, purCount: 0, salQty: 0, salVal: 0, salCount: 0 },
    evening: { purQty: 0, purVal: 0, purCount: 0, salQty: 0, salVal: 0, salCount: 0 },
    night:   { purQty: 0, purVal: 0, purCount: 0, salQty: 0, salVal: 0, salCount: 0 },
  };
  for (const o of salesCompleted) {
    if (!o.created_at) continue;
    const k = shiftOf(istHour(o.created_at));
    const qty = Number(o.effective_usdt_qty || o.quantity) || 0;
    const rate = Number(o.effective_usdt_rate || o.price_per_unit) || 0;
    const value = Number(o.total_amount) || qty * rate;
    shiftAgg[k].salQty += qty;
    shiftAgg[k].salVal += value;
    shiftAgg[k].salCount += 1;
  }
  for (const o of purchasesCompleted) {
    if (!o.created_at) continue;
    const k = shiftOf(istHour(o.created_at));
    const qty = Number(o.effective_usdt_qty) || 0;
    const value = Number(o.total_amount) || 0;
    shiftAgg[k].purQty += qty;
    shiftAgg[k].purVal += value;
    shiftAgg[k].purCount += 1;
  }
  const shiftBreakdown = (["morning", "evening", "night"] as ShiftKey[]).map((k) => {
    const a = shiftAgg[k];
    return {
      key: k,
      label: SHIFT_META[k].label,
      window: SHIFT_META[k].window,
      purchaseQty: fmtNum(a.purQty, 4),
      purchaseValue: fmtNum(a.purVal),
      purchaseCount: a.purCount,
      avgPurchaseRate: fmtNum(a.purQty > 0 ? a.purVal / a.purQty : 0, 4),
      salesQty: fmtNum(a.salQty, 4),
      salesValue: fmtNum(a.salVal),
      salesCount: a.salCount,
      avgSalesRate: fmtNum(a.salQty > 0 ? a.salVal / a.salQty : 0, 4),
    };
  });

  // ----- Fees -----

  const dayStart = date + "T00:00:00";
  const dayEnd = date + "T23:59:59";
  const { data: feeRows } = await supabase
    .from("wallet_transactions")
    .select("amount, reference_type")
    .eq("transaction_type", "DEBIT")
    .in("reference_type", ["PLATFORM_FEE", "TRANSFER_FEE", "SALES_ORDER_FEE", "PURCHASE_ORDER_FEE"])
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd);
  const feesByType: Record<string, number> = {};
  let totalFees = 0;
  for (const f of feeRows || []) {
    const amt = Number(f.amount) || 0;
    totalFees += amt;
    feesByType[f.reference_type] = (feesByType[f.reference_type] || 0) + amt;
  }

  // ----- Expenses (bank_transactions of type EXPENSE for the day) -----
  const EXCLUDED_EXP_CATS = [
    "Purchase", "Sales", "Stock Purchase", "Stock Sale", "Trade", "Trading",
    "Settlement", "Payment Gateway Settlement", "OPENING_BALANCE", "ADJUSTMENT",
  ];
  const { data: expenseRows } = await supabase
    .from("bank_transactions")
    .select("amount, category, description, reference_number, transaction_date, is_reversed")
    .eq("transaction_type", "EXPENSE")
    .eq("transaction_date", date);
  const expenseList: { category: string; description: string; amount: number }[] = [];
  const expenseByCategory: Record<string, number> = {};
  let totalExpenses = 0;
  for (const e of expenseRows || []) {
    if (e.is_reversed) continue;
    const cat = e.category || "Uncategorized";
    const topCat = String(cat).split(" > ")[0];
    if (EXCLUDED_EXP_CATS.includes(topCat)) continue;
    const amt = Number(e.amount) || 0;
    totalExpenses += amt;
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amt;
    expenseList.push({ category: cat, description: e.description || "", amount: amt });
  }
  expenseList.sort((a, b) => b.amount - a.amount);

  // ----- P&L (same formula as snapshot-daily-profit) -----
  const netPurchaseQty = totalPurchaseQty - totalFees;
  let effectivePurchaseRate = 0;
  if (totalPurchaseQty > 0 && netPurchaseQty > 0) effectivePurchaseRate = totalPurchaseValue / netPurchaseQty;
  else if (totalPurchaseQty > 0) effectivePurchaseRate = totalPurchaseValue / totalPurchaseQty;
  const npm = avgSalesRate - effectivePurchaseRate;
  const grossProfit = npm * totalSalesQty;
  const netProfit = grossProfit - totalFees;

  // ----- Wallet balances (current snapshot) -----
  const { data: balanceRows } = await supabase
    .from("wallet_asset_balances")
    .select("asset_code, balance");
  const balByAsset: Record<string, number> = {};
  for (const b of balanceRows || []) {
    balByAsset[b.asset_code] = (balByAsset[b.asset_code] || 0) + (Number(b.balance) || 0);
  }

  // ----- Statistics -----
  const hourly = new Array(24).fill(0);
  for (const o of [...salesCompleted, ...purchasesCompleted]) {
    if (o.created_at) hourly[istHour(o.created_at)] += 1;
  }
  let busiestHour = 0;
  for (let h = 1; h < 24; h++) if (hourly[h] > hourly[busiestHour]) busiestHour = h;

  // Top clients by sales value
  const clientVal: Record<string, number> = {};
  for (const o of salesCompleted) {
    const c = o.client_name || "Unknown";
    clientVal[c] = (clientVal[c] || 0) + (Number(o.total_amount) || 0);
  }
  const topClients = Object.entries(clientVal).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Day-over-day
  const prevSalesVal = salesPrevRaw.filter((o: any) => o.status === "COMPLETED")
    .reduce((s: number, o: any) => s + (Number(o.total_amount) || 0), 0);
  const prevPurchaseVal = purchasesPrevRaw.filter((o: any) => o.status === "COMPLETED")
    .reduce((s: number, o: any) => s + (Number(o.total_amount) || 0), 0);

  // ----- Charts -----
  const charts = {
    salesVsPurchase: quickChart({
      type: "bar",
      data: {
        labels: ["Sales", "Purchases"],
        datasets: [{ label: "Value (INR)", data: [Math.round(totalSalesValue), Math.round(totalPurchaseValue)], backgroundColor: [COPPER, COPPER_DARK] }],
      },
      options: { plugins: { legend: { display: false }, title: { display: true, text: "Sales vs Purchases (INR)" } } },
    }),
    pnl: quickChart({
      type: "bar",
      data: {
        labels: ["Gross Profit", "Fees", "Net Profit"],
        datasets: [{ data: [Math.round(grossProfit), Math.round(totalFees), Math.round(netProfit)], backgroundColor: [COPPER, AMBER, netProfit >= 0 ? GREEN : RED] }],
      },
      options: { plugins: { legend: { display: false }, title: { display: true, text: "P&L Breakdown (INR)" } } },
    }),
    volumeByAsset: quickChart({
      type: "bar",
      data: {
        labels: Object.keys({ ...salesByAsset, ...purchaseByAsset }),
        datasets: [
          { label: "Sales Qty", data: Object.keys({ ...salesByAsset, ...purchaseByAsset }).map((a) => Math.round(salesByAsset[a]?.qty || 0)), backgroundColor: COPPER },
          { label: "Purchase Qty", data: Object.keys({ ...salesByAsset, ...purchaseByAsset }).map((a) => Math.round(purchaseByAsset[a]?.qty || 0)), backgroundColor: COPPER_DARK },
        ],
      },
      options: { plugins: { title: { display: true, text: "Volume by Asset (USDT-eq)" } } },
    }),
    hourly: quickChart({
      type: "line",
      data: {
        labels: Array.from({ length: 24 }, (_, h) => `${h}:00`),
        datasets: [{ label: "Orders", data: hourly, borderColor: COPPER, backgroundColor: "rgba(184,115,51,0.2)", fill: true, tension: 0.3 }],
      },
      options: { plugins: { legend: { display: false }, title: { display: true, text: "Hourly Activity (IST)" } } },
    }),
    expensesByCategory: Object.keys(expenseByCategory).length
      ? quickChart({
          type: "bar",
          data: {
            labels: Object.keys(expenseByCategory),
            datasets: [{ label: "Expense (INR)", data: Object.values(expenseByCategory).map((v) => Math.round(v)), backgroundColor: AMBER }],
          },
          options: { indexAxis: "y", plugins: { legend: { display: false }, title: { display: true, text: "Expenses by Category (INR)" } } },
        })
      : "",
  };

  return {
    date,
    pnl: {
      grossProfit: fmtNum(grossProfit),
      netProfit: fmtNum(netProfit),
      avgSalesRate: fmtNum(avgSalesRate, 4),
      effectivePurchaseRate: fmtNum(effectivePurchaseRate, 4),
      npm: fmtNum(npm, 4),
      totalFees: fmtNum(totalFees, 4),
      netProfitPositive: netProfit >= 0,
    },
    sales: {
      totalQty: fmtNum(totalSalesQty, 4),
      totalValue: fmtNum(totalSalesValue),
      orderCount: salesCompleted.length,
      totalOrders: salesRaw.length,
      avgTicket: fmtNum(salesCompleted.length ? totalSalesValue / salesCompleted.length : 0),
      byAsset: Object.entries(salesByAsset).map(([asset, v]) => ({ asset, qty: fmtNum(v.qty, 4), value: fmtNum(v.value), count: v.count })),
    },
    purchases: {
      totalQty: fmtNum(totalPurchaseQty, 4),
      totalValue: fmtNum(totalPurchaseValue),
      orderCount: purchasesCompleted.length,
      totalOrders: purchasesRaw.length,
      avgTicket: fmtNum(purchasesCompleted.length ? totalPurchaseValue / purchasesCompleted.length : 0),
      byAsset: Object.entries(purchaseByAsset).map(([asset, v]) => ({ asset, qty: fmtNum(v.qty, 4), value: fmtNum(v.value), count: v.count })),
    },
    wallet: {
      balances: Object.entries(balByAsset).filter(([, b]) => Math.abs(b) > 0.000001).map(([asset, b]) => ({ asset, balance: fmtNum(b, 4) })),
      feesByType: Object.entries(feesByType).map(([type, amt]) => ({ type: type.replace(/_/g, " "), amount: fmtNum(amt, 4) })),
      totalFees: fmtNum(totalFees, 4),
    },
    expenses: {
      totalExpenses: fmtNum(totalExpenses),
      count: expenseList.length,
      byCategory: Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount: fmtNum(amount) })),
      list: expenseList.slice(0, 50).map((e) => ({ category: e.category, description: e.description, amount: fmtNum(e.amount) })),
    },
    shifts: shiftBreakdown,
    platformRates,
    stats: {

      busiestHour: `${busiestHour}:00 - ${busiestHour + 1}:00 IST`,
      totalOrders: salesRaw.length + purchasesRaw.length,
      completedOrders: salesCompleted.length + purchasesCompleted.length,
      topClients: topClients.map(([name, val]) => ({ name, value: fmtNum(val) })),
      salesChangePct: prevSalesVal > 0 ? fmtNum(((totalSalesValue - prevSalesVal) / prevSalesVal) * 100, 1) : "N/A",
      purchaseChangePct: prevPurchaseVal > 0 ? fmtNum(((totalPurchaseValue - prevPurchaseVal) / prevPurchaseVal) * 100, 1) : "N/A",
    },
    assetValue: {
      total: fmtNum(av.total),
      totalPositive: av.total >= 0,
      totalBank: fmtNum(av.totalBank),
      totalGateway: fmtNum(av.totalGateway),
      stockVal: fmtNum(av.stockVal),
      totalUnpaidTds: fmtNum(av.totalUnpaidTds),
      bankCount: av.bankCount,
      pendingCount: av.pendingCount,
      tdsCount: av.tdsCount,
      assetStocks: av.assetStocks.map((a) => ({
        asset: a.asset_code,
        units: fmtNum(a.total_units, 4),
        avgCost: fmtNum(a.avg_cost, 4),
        value: fmtNum(a.total_value),
      })),
      gatewayGroups: av.gatewayGroups.map((g) => ({ name: g.gateway_name, total: fmtNum(g.total), count: g.count })),
    },
    charts,
    kyc,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    const date: string = body.date || previousIstDate();
    const recipients: string[] = body.recipients || RECIPIENTS;

    const report = await buildReport(supabase, date);

    const results: { recipient: string; success: boolean; error?: string }[] = [];
    for (const recipient of recipients) {
      const { error: invokeError } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "daily-business-report",
          recipientEmail: recipient,
          idempotencyKey: `daily-report-${date}-${recipient}`,
          templateData: report,
        },
      });
      results.push({ recipient, success: !invokeError, error: invokeError?.message });
      if (invokeError) console.error(`daily-report-email send error for ${recipient}:`, invokeError);
    }

    const allOk = results.every((r) => r.success);

    return new Response(JSON.stringify({ success: allOk, date, recipients: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("daily-report-email error:", error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
