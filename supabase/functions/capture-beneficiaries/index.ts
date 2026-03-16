import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ACTIVE_STATUSES = ["PENDING", "TRADING", "BUYER_PAYED", "DISTRIBUTING"];

/**
 * Extract seller payment details from Binance getUserOrderDetail response.
 * Binance returns payment info in payMethods[].fields array with typed fieldContentType.
 */
function extractPaymentFromDetail(detail: any): {
  accountNo: string;
  accountName: string;
  bankName: string;
  ifscCode: string;
  accountType: string;
  accountOpeningBranch: string;
  payType: string;
  sellerNickname: string;
} | null {
  const methods = detail?.payMethods || detail?.payMethodList || detail?.tradeMethods;
  if (!Array.isArray(methods) || methods.length === 0) return null;

  const primary = methods[0];
  const fields: any[] = Array.isArray(primary.fields) ? primary.fields : [];

  const findField = (predicate: (f: any) => boolean): string => {
    const field = fields.find((f) => {
      const val = String(f?.fieldValue || "").trim();
      return val && predicate(f);
    });
    return String(field?.fieldValue || "").trim();
  };

  const accountNo = findField((f) => {
    const name = String(f?.fieldName || "").toLowerCase();
    const ct = String(f?.fieldContentType || "").toLowerCase();
    return ct === "pay_account" || /bank account|account\/?card/.test(name);
  });

  // Skip if no account number — nothing useful to store
  if (!accountNo || accountNo.length < 4) return null;

  const accountName = findField((f) => {
    const name = String(f?.fieldName || "").toLowerCase();
    const ct = String(f?.fieldContentType || "").toLowerCase();
    return ct === "payee" || name === "name" || name.includes("account holder");
  });

  const ifscCode = findField((f) =>
    String(f?.fieldName || "").toLowerCase().includes("ifsc")
  );

  const bankName = findField((f) => {
    const name = String(f?.fieldName || "").toLowerCase();
    const ct = String(f?.fieldContentType || "").toLowerCase();
    return ct === "bank" || name.includes("bank name");
  });

  const accountType = findField((f) =>
    String(f?.fieldName || "").toLowerCase().includes("account type")
  );

  const accountOpeningBranch = findField((f) => {
    const name = String(f?.fieldName || "").toLowerCase();
    return name.includes("opening branch") || name === "branch";
  });

  return {
    accountNo,
    accountName,
    bankName,
    ifscCode,
    accountType,
    accountOpeningBranch,
    payType: primary.identifier || primary.tradeMethodName || detail.payType || "",
    sellerNickname: detail.sellerNickname || detail.counterPartNickName || "",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const BINANCE_PROXY_URL = Deno.env.get("BINANCE_PROXY_URL");
  const BINANCE_API_KEY = Deno.env.get("BINANCE_API_KEY");
  const BINANCE_API_SECRET = Deno.env.get("BINANCE_API_SECRET");
  const BINANCE_PROXY_TOKEN = Deno.env.get("BINANCE_PROXY_TOKEN");

  if (!BINANCE_PROXY_URL || !BINANCE_API_KEY || !BINANCE_API_SECRET || !BINANCE_PROXY_TOKEN) {
    console.error("[CaptureBeneficiaries] Missing Binance secrets");
    return new Response(JSON.stringify({ error: "Missing Binance configuration" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const proxyHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "x-proxy-token": BINANCE_PROXY_TOKEN,
    "x-api-key": BINANCE_API_KEY,
    "x-api-secret": BINANCE_API_SECRET,
    clientType: "web",
  };

  let captured = 0;
  let checked = 0;

  try {
    // 1a. Find active BUY orders without captured seller_payment_details
    const { data: activeOrders, error: queryErr } = await supabase
      .from("binance_order_history")
      .select("order_number, order_status")
      .eq("trade_type", "BUY")
      .in("order_status", ACTIVE_STATUSES)
      .is("seller_payment_details", null)
      .order("create_time", { ascending: false })
      .limit(20);

    if (queryErr) {
      console.error("[CaptureBeneficiaries] DB query error:", queryErr);
      return new Response(JSON.stringify({ error: queryErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1b. Also find recently completed BUY orders (last 6 hours) that were never captured
    //     Orders can complete between sync cycles; Binance still returns payMethods for recent completions
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    const { data: recentCompleted } = await supabase
      .from("binance_order_history")
      .select("order_number, order_status")
      .eq("trade_type", "BUY")
      .eq("order_status", "COMPLETED")
      .is("seller_payment_details", null)
      .gte("create_time", sixHoursAgo)
      .order("create_time", { ascending: false })
      .limit(10);

    const allOrders = [...(activeOrders || []), ...(recentCompleted || [])];
    // Deduplicate by order_number
    const seen = new Set<string>();
    const ordersToProcess = allOrders.filter((o) => {
      if (seen.has(o.order_number)) return false;
      seen.add(o.order_number);
      return true;
    });

    if (ordersToProcess.length === 0) {
      console.log("[CaptureBeneficiaries] No orders needing capture.");
      return new Response(
        JSON.stringify({ captured: 0, checked: 0, duration_ms: Date.now() - startTime }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[CaptureBeneficiaries] Found ${ordersToProcess.length} orders to process (${activeOrders?.length || 0} active + ${recentCompleted?.length || 0} recent completed).`);

    for (const order of ordersToProcess) {
      checked++;

      try {
        const detailUrl = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/getUserOrderDetail`;
        const detailResp = await fetch(detailUrl, {
          method: "POST",
          headers: proxyHeaders,
          body: JSON.stringify({ adOrderNo: order.order_number }),
        });

        const detailText = await detailResp.text();
        let detailJson: any;
        try {
          detailJson = JSON.parse(detailText);
        } catch {
          console.warn(`[CaptureBeneficiaries] Non-JSON response for ${order.order_number}`);
          continue;
        }

        const detail = detailJson?.data?.data || detailJson?.data || detailJson;
        if (!detail) {
          console.warn(`[CaptureBeneficiaries] Empty detail for ${order.order_number}`);
          continue;
        }

        const paymentInfo = extractPaymentFromDetail(detail);

        // Store full detail in seller_payment_details for future reference
        const paymentDetails: Record<string, any> = {
          ...(paymentInfo || {}),
          captured_at: new Date().toISOString(),
          captured_from_status: order.order_status,
          _detail_keys: Object.keys(detail),
          _raw_detail: detail,
        };

        const { error: updateErr } = await supabase
          .from("binance_order_history")
          .update({ seller_payment_details: paymentDetails })
          .eq("order_number", order.order_number);

        if (updateErr) {
          console.warn(`[CaptureBeneficiaries] DB update failed for ${order.order_number}:`, updateErr);
          continue;
        }

        // 3. Upsert into beneficiary_records
        if (paymentInfo && paymentInfo.accountNo) {
          const { error: rpcErr } = await supabase.rpc("upsert_beneficiary_record", {
            p_account_number: paymentInfo.accountNo,
            p_account_holder_name: paymentInfo.accountName || null,
            p_ifsc_code: paymentInfo.ifscCode || null,
            p_bank_name: paymentInfo.bankName || null,
            p_source_order_number: order.order_number,
            p_client_name: paymentInfo.sellerNickname || null,
            p_account_type: paymentInfo.accountType || null,
            p_account_opening_branch: paymentInfo.accountOpeningBranch || null,
          });

          if (rpcErr) {
            console.warn(`[CaptureBeneficiaries] Beneficiary upsert failed for ${order.order_number}:`, rpcErr);
          } else {
            console.log(
              `[CaptureBeneficiaries] ✓ Beneficiary saved: ${paymentInfo.accountNo} (${paymentInfo.bankName || "unknown bank"}) from order ${order.order_number}`
            );
          }
        }

        captured++;
        console.log(
          `[CaptureBeneficiaries] ✓ Captured details for ${order.order_number}:`,
          paymentInfo
            ? `account=${paymentInfo.accountNo}, bank=${paymentInfo.bankName}`
            : "raw detail stored"
        );
      } catch (e) {
        console.warn(`[CaptureBeneficiaries] Error processing ${order.order_number}:`, e);
      }

      // Rate limit: 400ms between API calls
      await new Promise((r) => setTimeout(r, 400));
    }

    const duration = Date.now() - startTime;
    console.log(`[CaptureBeneficiaries] Complete: ${captured}/${checked} captured in ${duration}ms`);

    return new Response(
      JSON.stringify({ captured, checked, duration_ms: duration }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[CaptureBeneficiaries] Fatal error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
