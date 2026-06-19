import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAccount } from "../_shared/binance-account.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── AUTH: require a signed-in Super Admin ──
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData } = await supabase.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isSA } = await supabase.rpc("has_role", {
      _user_id: uid,
      _role: "super admin",
    });
    if (!isSA) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Which exchange account to verify? (defaults to the primary account)
    let requestedAccountId: string | null = null;
    try {
      const body = await req.json();
      requestedAccountId = body?.exchange_account_id ?? body?.exchangeAccountId ?? null;
    } catch {
      requestedAccountId = null;
    }

    let acct;
    try {
      acct = await resolveAccount(requestedAccountId);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: (e as Error).message, api_key_configured: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const BINANCE_PROXY_URL = acct.proxyUrl;
    const BINANCE_API_KEY = acct.apiKey;
    const BINANCE_API_SECRET = acct.apiSecret;
    const BINANCE_PROXY_TOKEN = acct.proxyToken;

    // Return only boolean configuration flags — never any portion of the secret values.
    const results: Record<string, any> = {
      exchange_account_id: acct.id,
      account_name: acct.accountName,
      proxy_url_configured: !!BINANCE_PROXY_URL,
      api_key_configured: !!BINANCE_API_KEY,
      api_secret_configured: !!BINANCE_API_SECRET,
      proxy_token_configured: !!BINANCE_PROXY_TOKEN,
    };

    let proxyAlive = false;
    try {
      const pingRes = await fetch(`${BINANCE_PROXY_URL}/api/v3/ping`, {
        headers: { "x-proxy-token": BINANCE_PROXY_TOKEN || "" },
      });
      proxyAlive = pingRes.ok;
      results.proxy_ping = proxyAlive ? "OK" : `Failed (${pingRes.status})`;
    } catch (e) {
      results.proxy_ping = `Error: ${(e as Error).message}`;
    }

    try {
      const timeRes = await fetch(`${BINANCE_PROXY_URL}/api/v3/time`, {
        headers: { "x-proxy-token": BINANCE_PROXY_TOKEN || "" },
      });
      results.server_time_ok = timeRes.ok;
    } catch (e) {
      results.server_time_ok = false;
    }

    try {
      const accRes = await fetch(`${BINANCE_PROXY_URL}/api/sapi/v1/capital/config/getall`, {
        headers: {
          "Content-Type": "application/json",
          "x-proxy-token": BINANCE_PROXY_TOKEN || "",
          "x-api-key": BINANCE_API_KEY || "",
          "x-api-secret": BINANCE_API_SECRET || "",
        },
      });
      if (accRes.ok) {
        const parsed = await accRes.json();
        results.api_key_valid = true;
        results.assets_found = Array.isArray(parsed) ? parsed.length : 0;
      } else {
        results.api_key_valid = false;
        results.api_status = accRes.status;
      }
    } catch (e) {
      results.api_key_valid = false;
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
