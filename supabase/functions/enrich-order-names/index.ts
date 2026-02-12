import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2,
  delayMs = 500
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (err) {
      lastError = err as Error;
      const msg = (err as Error).message || "";
      if (
        msg.includes("connection closed") ||
        msg.includes("ConnectionReset") ||
        msg.includes("SendRequest") ||
        msg.includes("ECONNRESET")
      ) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BINANCE_PROXY_URL = Deno.env.get("BINANCE_PROXY_URL");
    const BINANCE_API_KEY = Deno.env.get("BINANCE_API_KEY");
    const BINANCE_API_SECRET = Deno.env.get("BINANCE_API_SECRET");
    const BINANCE_PROXY_TOKEN = Deno.env.get("BINANCE_PROXY_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!BINANCE_PROXY_URL || !BINANCE_API_KEY || !BINANCE_API_SECRET || !BINANCE_PROXY_TOKEN) {
      return new Response(JSON.stringify({ error: "Missing proxy config" }), {
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
    };

    // Fetch orders from last 30 days that are COMPLETED but missing verified_name
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const { data: orders, error: fetchErr } = await supabase
      .from("binance_order_history")
      .select("order_number, trade_type")
      .is("verified_name", null)
      .eq("order_status", "COMPLETED")
      .gte("create_time", thirtyDaysAgo)
      .order("create_time", { ascending: false })
      .limit(20); // Process max 20 per run to stay within timeout

    if (fetchErr) {
      console.error("DB fetch error:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!orders || orders.length === 0) {
      return new Response(JSON.stringify({ enriched: 0, message: "No orders to enrich" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Enriching ${orders.length} orders...`);
    let enriched = 0;
    let failed = 0;

    for (const order of orders) {
      try {
        // Fetch order detail from Binance
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/getUserOrderDetail`;
        const response = await fetchWithRetry(url, {
          method: "POST",
          headers: proxyHeaders,
          body: JSON.stringify({ adOrderNo: order.order_number }),
        });

        const text = await response.text();
        let result: any;
        try {
          result = JSON.parse(text);
        } catch {
          console.warn(`Failed to parse response for ${order.order_number}`);
          failed++;
          continue;
        }

        const detail = result?.data?.data || result?.data || result;
        if (!detail || detail.error) {
          console.warn(`No detail for ${order.order_number}:`, JSON.stringify(result).substring(0, 500));
          failed++;
          continue;
        }

        // For BUY orders, counterparty is seller; for SELL orders, counterparty is buyer
        let verifiedName: string | null = null;
        if (order.trade_type === "BUY") {
          verifiedName = detail.sellerRealName || detail.sellerName || null;
        } else {
          verifiedName = detail.buyerRealName || detail.buyerName || null;
        }

        if (verifiedName) {
          const { error: updateErr } = await supabase
            .from("binance_order_history")
            .update({ verified_name: verifiedName })
            .eq("order_number", order.order_number);

          if (!updateErr) {
            enriched++;
          } else {
            console.warn(`Update failed for ${order.order_number}:`, updateErr);
            failed++;
          }
        } else {
          console.warn(`No name found for ${order.order_number} (${order.trade_type}), detail keys:`, Object.keys(detail));
          failed++;
        }

        // Rate limit: 200ms delay between API calls
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        console.warn(`Error enriching ${order.order_number}:`, err);
        failed++;
      }
    }

    console.log(`Enrichment complete: ${enriched} enriched, ${failed} failed out of ${orders.length}`);

    return new Response(
      JSON.stringify({ enriched, failed, total: orders.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Enrich error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
