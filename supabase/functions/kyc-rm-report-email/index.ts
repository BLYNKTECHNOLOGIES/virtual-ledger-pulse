import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------- date helpers (IST) ----------
function istToday(): string {
  const nowMs = Date.now() + 5.5 * 60 * 60 * 1000;
  return new Date(nowMs).toISOString().split("T")[0];
}
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}
// Inclusive IST-day boundaries expressed as timestamptz literals for PostgREST filters.
function istDayBounds(date: string): { start: string; end: string } {
  return { start: `${date}T00:00:00+05:30`, end: `${shiftDate(date, 1)}T00:00:00+05:30` };
}

// ---------- shift bucketing (IST) ----------
// Morning 09:00–17:00 · Evening 17:00–01:00 · Night 01:00–09:00
const SHIFTS = ["Morning", "Evening", "Night"] as const;
type Shift = typeof SHIFTS[number];
const SHIFT_LABELS: Record<Shift, string> = {
  Morning: "Morning (09:00–17:00)",
  Evening: "Evening (17:00–01:00)",
  Night: "Night (01:00–09:00)",
};
function istHour(ts: unknown): number | null {
  if (!ts) return null;
  const t = new Date(String(ts)).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + 5.5 * 60 * 60 * 1000).getUTCHours();
}
function shiftOf(ts: unknown): Shift | null {
  const h = istHour(ts);
  if (h === null) return null;
  if (h >= 9 && h < 17) return "Morning";
  if (h >= 1 && h < 9) return "Night";
  return "Evening"; // 17:00–23:59 and 00:00–00:59
}

// ---------- formatting ----------
const nf = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => nf.format(Number.isFinite(n) ? n : 0);
const normName = (s: unknown) => String(s ?? "").trim().toLowerCase();
const maskPhone = (p: unknown): string => {
  const s = String(p ?? "").replace(/\s+/g, "");
  if (!s) return "—";
  if (s.length <= 4) return s;
  return `${s.slice(0, 2)}••••${s.slice(-3)}`;
};

// Fetch all rows (paginated) for a PostgREST query builder.
async function fetchAllRows(builder: () => any): Promise<any[]> {
  const pageSize = 1000;
  let from = 0;
  const out: any[] = [];
  // deno-lint-ignore no-constant-condition
  while (true) {
    const { data, error } = await builder().range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function headCount(builder: () => any): Promise<number> {
  const { count, error } = await builder();
  if (error) throw error;
  return count || 0;
}

// ---------- report builder ----------
async function buildKycRmReport(supabase: any, date: string) {
  const { start, end } = istDayBounds(date);

  // ---- Section 1: Onboarding & KYC KPIs ----
  const newClients = await headCount(() =>
    supabase.from("clients").select("*", { count: "exact", head: true })
      .eq("date_of_onboarding", date).not("is_deleted", "is", true));

  const approvalsToday = await fetchAllRows(() =>
    supabase.from("client_onboarding_approvals")
      .select("resolved_client_id, reviewed_by, approval_status, client_name")
      .gte("reviewed_at", start).lt("reviewed_at", end));

  const approvedRows = approvalsToday.filter((r) => r.approval_status === "APPROVED");
  const rejectedRows = approvalsToday.filter((r) => r.approval_status === "REJECTED");
  const distinctApproved = new Set(
    approvedRows.map((r) => r.resolved_client_id || normName(r.client_name)),
  ).size;

  const kycDocsToday = await headCount(() =>
    supabase.from("client_kyc_documents").select("*", { count: "exact", head: true })
      .gte("created_at", start).lt("created_at", end).is("deleted_at", null));

  const pendingBacklog = await headCount(() =>
    supabase.from("client_onboarding_approvals").select("*", { count: "exact", head: true })
      .eq("approval_status", "PENDING"));

  const kpis = {
    newClients,
    approvalsDone: approvedRows.length,
    distinctApproved,
    rejections: rejectedRows.length,
    kycDocs: kycDocsToday,
    pendingBacklog,
  };

  // ---- Section 3: Trading activity today (segregated) ----
  const salesToday = await fetchAllRows(() =>
    supabase.from("sales_orders")
      .select("client_id, client_name, client_phone, total_amount, created_by")
      .eq("order_date", date));
  const purchasesToday = await fetchAllRows(() =>
    supabase.from("purchase_orders")
      .select("supplier_name, contact_number, total_amount")
      .eq("order_date", date));

  const salesAmount = salesToday.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const purchaseAmount = purchasesToday.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const distinctSalesClients = new Set(
    salesToday.map((r) => r.client_id || normName(r.client_name)),
  ).size;
  const distinctSuppliers = new Set(purchasesToday.map((r) => normName(r.supplier_name))).size;

  const trading = {
    salesAmount: money(salesAmount),
    salesCount: salesToday.length,
    salesClients: distinctSalesClients,
    purchaseAmount: money(purchaseAmount),
    purchaseCount: purchasesToday.length,
    suppliers: distinctSuppliers,
    turnover: money(salesAmount + purchaseAmount),
    turnoverOrders: salesToday.length + purchasesToday.length,
  };

  // ---- Section 2: New clients who traded for the FIRST time today ----
  const todayClientIds = Array.from(
    new Set(salesToday.map((r) => r.client_id).filter((x): x is string => !!x)),
  );
  let priorClientIds = new Set<string>();
  if (todayClientIds.length > 0) {
    const priorRows = await fetchAllRows(() =>
      supabase.from("sales_orders").select("client_id")
        .in("client_id", todayClientIds).lt("order_date", date));
    priorClientIds = new Set(priorRows.map((r) => r.client_id).filter(Boolean));
  }
  // First-time client_ids = today's clients with NO order before today.
  const firstTimeIds = new Set(todayClientIds.filter((id) => !priorClientIds.has(id)));

  // Aggregate today's first-trade value per first-time client.
  const firstMap = new Map<string, { name: string; phone: string; value: number; operator: string }>();
  for (const r of salesToday) {
    if (!r.client_id || !firstTimeIds.has(r.client_id)) continue;
    const e = firstMap.get(r.client_id) ||
      { name: r.client_name || "—", phone: r.client_phone || "", value: 0, operator: r.created_by || "" };
    e.value += Number(r.total_amount || 0);
    firstMap.set(r.client_id, e);
  }

  // Resolve operator (created_by) uuid -> display name for the first-time table.
  const operatorIds = Array.from(
    new Set(Array.from(firstMap.values()).map((e) => e.operator).filter(Boolean)),
  );
  const userNameById = new Map<string, string>();
  const allUserIds = Array.from(new Set([
    ...operatorIds,
    ...approvalsToday.map((r) => r.reviewed_by).filter(Boolean),
  ]));
  if (allUserIds.length > 0) {
    const users = await fetchAllRows(() =>
      supabase.from("users").select("id, first_name, last_name, username").in("id", allUserIds));
    for (const u of users) {
      const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
      userNameById.set(u.id, full || u.username || "Unknown");
    }
  }

  const firstTimeRows = Array.from(firstMap.values())
    .map((e) => ({
      name: e.name,
      phone: maskPhone(e.phone),
      value: money(e.value),
      operator: userNameById.get(e.operator) || "—",
    }))
    .sort((a, b) => Number(b.value.replace(/,/g, "")) - Number(a.value.replace(/,/g, "")))
    .slice(0, 15);

  const firstTime = {
    count: firstTimeIds.size,
    totalValue: money(
      Array.from(firstMap.values()).reduce((s, e) => s + e.value, 0),
    ),
    rows: firstTimeRows,
  };

  // ---- Section 4: Top clients by turnover today (sales + purchases, matched by name) ----
  const turnoverMap = new Map<string, { name: string; sales: number; purchase: number }>();
  for (const r of salesToday) {
    const key = normName(r.client_name) || (r.client_id ?? "");
    if (!key) continue;
    const e = turnoverMap.get(key) || { name: r.client_name || "—", sales: 0, purchase: 0 };
    e.sales += Number(r.total_amount || 0);
    turnoverMap.set(key, e);
  }
  for (const r of purchasesToday) {
    const key = normName(r.supplier_name);
    if (!key) continue;
    const e = turnoverMap.get(key) || { name: r.supplier_name || "—", sales: 0, purchase: 0 };
    e.purchase += Number(r.total_amount || 0);
    turnoverMap.set(key, e);
  }
  const topClients = Array.from(turnoverMap.values())
    .map((e) => ({ ...e, total: e.sales + e.purchase }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((e) => ({
      name: e.name,
      sales: e.sales > 0 ? money(e.sales) : "—",
      purchase: e.purchase > 0 ? money(e.purchase) : "—",
      total: money(e.total),
    }));

  // ---- Section 5: RM / KYC team productivity ----
  const prodMap = new Map<string, { name: string; approvals: number; rejections: number }>();
  for (const r of approvalsToday) {
    if (!r.reviewed_by) continue;
    const name = userNameById.get(r.reviewed_by) || "Unknown";
    const e = prodMap.get(r.reviewed_by) || { name, approvals: 0, rejections: 0 };
    if (r.approval_status === "APPROVED") e.approvals += 1;
    else if (r.approval_status === "REJECTED") e.rejections += 1;
    prodMap.set(r.reviewed_by, e);
  }
  const productivity = Array.from(prodMap.values())
    .filter((e) => e.approvals + e.rejections > 0)
    .sort((a, b) => (b.approvals + b.rejections) - (a.approvals + a.rejections));

  // ---- Section 6: Compliance watch (rows auto-hide when zero) ----
  const pendingLimitRequests = await headCount(() =>
    supabase.from("client_limit_requests").select("*", { count: "exact", head: true })
      .in("status", ["PENDING", "pending"]));
  const rekycToday = await headCount(() =>
    supabase.from("rekyc_requests").select("*", { count: "exact", head: true })
      .gte("created_at", start).lt("created_at", end));
  const highRiskOnboarded = await headCount(() =>
    supabase.from("clients").select("*", { count: "exact", head: true })
      .eq("date_of_onboarding", date).not("is_deleted", "is", true)
      .ilike("default_risk_level", "%high%"));

  const compliance = {
    pendingLimitRequests,
    rekycToday,
    highRiskOnboarded,
    hasAny: pendingLimitRequests > 0 || rekycToday > 0 || highRiskOnboarded > 0,
  };

  return { date, kpis, firstTime, trading, topClients, productivity, compliance };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    const date: string = body.date || istToday();
    const recipients: string[] = Array.isArray(body.recipients)
      ? body.recipients.filter((r: string) => !!r && r.trim())
      : [];

    const report = await buildKycRmReport(supabase, date);

    if (body?.dryRun === true) {
      return new Response(JSON.stringify({ success: true, dryRun: true, report }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No recipients provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { recipient: string; success: boolean; error?: string }[] = [];
    for (const recipient of recipients) {
      const { error: invokeError } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "kyc-rm-report",
          recipientEmail: recipient,
          idempotencyKey: `kyc-rm-report-${date}-${recipient}`,
          templateData: report,
        },
      });
      results.push({ recipient, success: !invokeError, error: invokeError?.message });
      if (invokeError) console.error(`kyc-rm-report-email send error for ${recipient}:`, invokeError);
    }

    const allOk = results.every((r) => r.success);
    return new Response(JSON.stringify({ success: allOk, date, recipients: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("kyc-rm-report-email error:", error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
