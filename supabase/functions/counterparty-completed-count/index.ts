import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { requireAuth } = await import("../_shared/require-auth.ts");
    const auth = await requireAuth(req, { corsHeaders });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const orderNumber = typeof body?.order_number === "string" ? body.order_number.trim() : "";
    const cpUserNo = typeof body?.cp_userno === "string" && body.cp_userno.trim() ? body.cp_userno.trim() : null;
    const verifiedName = typeof body?.verified_name === "string" && body.verified_name.trim() ? body.verified_name.trim() : null;
    const exchangeAccountId = typeof body?.exchange_account_id === "string" && body.exchange_account_id.trim()
      ? body.exchange_account_id.trim()
      : null;

    if (!orderNumber || orderNumber.length > 64) {
      return new Response(JSON.stringify({ error: "Valid order_number is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await auth.admin.rpc("get_counterparty_completed_order_count", {
      p_order_number: orderNumber,
      p_cp_userno: cpUserNo,
      p_exchange_account_id: exchangeAccountId,
      p_verified_name: verifiedName,
    });

    if (error) {
      console.error("counterparty-completed-count rpc error", error);
      return new Response(JSON.stringify({ error: "Unable to count completed orders" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ count: Number(data) || 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("counterparty-completed-count error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});