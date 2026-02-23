import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const BINANCE_PROXY_URL = Deno.env.get("BINANCE_PROXY_URL");
    const BINANCE_API_KEY = Deno.env.get("BINANCE_API_KEY");
    const BINANCE_API_SECRET = Deno.env.get("BINANCE_API_SECRET");
    const BINANCE_PROXY_TOKEN = Deno.env.get("BINANCE_PROXY_TOKEN");

    const results: Record<string, any> = {
      BINANCE_PROXY_URL: BINANCE_PROXY_URL ? `Set (${BINANCE_PROXY_URL.substring(0, 20)}...)` : "NOT SET",
      BINANCE_API_KEY: BINANCE_API_KEY ? `Set (${BINANCE_API_KEY.substring(0, 8)}...${BINANCE_API_KEY.slice(-4)})` : "NOT SET",
      BINANCE_API_SECRET: BINANCE_API_SECRET ? `Set (${BINANCE_API_SECRET.substring(0, 4)}...${BINANCE_API_SECRET.slice(-4)})` : "NOT SET",
      BINANCE_PROXY_TOKEN: BINANCE_PROXY_TOKEN ? `Set (${BINANCE_PROXY_TOKEN.substring(0, 4)}...)` : "NOT SET",
    };

    // Test 1: Ping proxy
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

    // Test 2: Server time (no auth needed)
    try {
      const timeRes = await fetch(`${BINANCE_PROXY_URL}/api/v3/time`, {
        headers: { "x-proxy-token": BINANCE_PROXY_TOKEN || "" },
      });
      const timeData = await timeRes.json();
      results.server_time = timeData;
    } catch (e) {
      results.server_time = `Error: ${(e as Error).message}`;
    }

    // Test 3: Account info (requires valid API key + secret)
    try {
      const accRes = await fetch(`${BINANCE_PROXY_URL}/api/sapi/v1/capital/config/getall`, {
        headers: {
          "Content-Type": "application/json",
          "x-proxy-token": BINANCE_PROXY_TOKEN || "",
          "x-api-key": BINANCE_API_KEY || "",
          "x-api-secret": BINANCE_API_SECRET || "",
        },
      });
      const accText = await accRes.text();
      if (accRes.ok) {
        const parsed = JSON.parse(accText);
        results.api_key_valid = true;
        results.assets_found = Array.isArray(parsed) ? parsed.length : "non-array response";
      } else {
        results.api_key_valid = false;
        results.api_error = accText.substring(0, 300);
      }
    } catch (e) {
      results.api_key_valid = false;
      results.api_error = (e as Error).message;
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
