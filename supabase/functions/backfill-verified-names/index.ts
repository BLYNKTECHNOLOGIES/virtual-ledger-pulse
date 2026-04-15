import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse batch size from request (default 50, max 200)
    let batchSize = 50;
    try {
      const body = await req.json();
      if (body?.batchSize) batchSize = Math.min(Math.max(Number(body.batchSize) || 50, 1), 200);
    } catch { /* default */ }

    // Fetch SELL orders missing verified_name
    const { data: orders, error: fetchErr } = await supabase
      .from("binance_order_history")
      .select("order_number")
      .eq("trade_type", "SELL")
      .is("verified_name", null)
      .order("create_time", { ascending: false })
      .limit(batchSize);

    if (fetchErr) {
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!orders || orders.length === 0) {
      return new Response(JSON.stringify({ message: "No orders to backfill", enriched: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call binance-ads edge function for each order to get buyer verified name
    let enriched = 0;
    let errors = 0;

    for (const order of orders) {
      try {
        const { data, error } = await supabase.functions.invoke("binance-ads", {
          body: { action: "getOrderDetail", orderNumber: order.order_number },
        });

        if (error) {
          errors++;
          continue;
        }

        const apiResult = data?.data;
        const detail = apiResult?.data || apiResult;
        // For SELL orders, we are the seller — counterparty is the buyer
        const buyerName = detail?.buyerRealName || detail?.buyerName || null;

        if (buyerName) {
          await supabase
            .from("binance_order_history")
            .update({ verified_name: buyerName })
            .eq("order_number", order.order_number);
          enriched++;
        }
      } catch {
        errors++;
      }

      // Rate limit: 200ms between requests
      await new Promise((r) => setTimeout(r, 200));
    }

    return new Response(
      JSON.stringify({
        message: `Backfill complete`,
        total: orders.length,
        enriched,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
