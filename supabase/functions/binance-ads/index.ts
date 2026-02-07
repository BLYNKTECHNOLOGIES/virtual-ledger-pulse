import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function signRequest(queryString: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(queryString);
  return hmac.digest("hex");
}

function buildSignedParams(params: Record<string, string | number | boolean>, secret: string): string {
  const timestamp = Date.now();
  const allParams = { ...params, timestamp: timestamp.toString() };
  const queryString = Object.entries(allParams)
    .filter(([_, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("&");
  const signature = signRequest(queryString, secret);
  return `${queryString}&signature=${signature}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BINANCE_PROXY_URL = Deno.env.get("BINANCE_PROXY_URL");
    const BINANCE_API_KEY = Deno.env.get("BINANCE_API_KEY");
    const BINANCE_API_SECRET = Deno.env.get("BINANCE_API_SECRET");

    if (!BINANCE_PROXY_URL || !BINANCE_API_KEY || !BINANCE_API_SECRET) {
      throw new Error("Missing Binance configuration secrets");
    }

    const { action, ...payload } = await req.json();

    const headers: Record<string, string> = {
      "X-MBX-APIKEY": BINANCE_API_KEY,
      "Content-Type": "application/json",
      "clientType": "web",
    };

    let result: any;

    switch (action) {
      case "listAds": {
        const body = {
          asset: payload.asset || "",
          tradeType: payload.tradeType || "",
          advStatus: payload.advStatus !== undefined ? payload.advStatus : null,
          page: payload.page || 1,
          rows: payload.rows || 20,
          startDate: payload.startDate || "",
          endDate: payload.endDate || "",
          fiatUnit: payload.fiatUnit || "INR",
        };
        
        // Remove empty/null fields
        const cleanBody = Object.fromEntries(
          Object.entries(body).filter(([_, v]) => v !== null && v !== "" && v !== undefined)
        );

        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}`;
        const signature = signRequest(queryString, BINANCE_API_SECRET);

        const url = `${BINANCE_PROXY_URL}/sapi/v1/c2c/ads/listWithPagination?${queryString}&signature=${signature}`;
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(cleanBody),
        });
        result = await response.json();
        break;
      }

      case "getAdDetail": {
        const timestamp = Date.now();
        const queryString = `adsNo=${payload.adsNo}&timestamp=${timestamp}`;
        const signature = signRequest(queryString, BINANCE_API_SECRET);

        const url = `${BINANCE_PROXY_URL}/sapi/v1/c2c/ads/getDetailByNo?${queryString}&signature=${signature}`;
        const response = await fetch(url, {
          method: "POST",
          headers,
        });
        result = await response.json();
        break;
      }

      case "postAd": {
        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}`;
        const signature = signRequest(queryString, BINANCE_API_SECRET);

        const url = `${BINANCE_PROXY_URL}/sapi/v1/c2c/ads/post?${queryString}&signature=${signature}`;
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload.adData),
        });
        result = await response.json();
        break;
      }

      case "updateAd": {
        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}`;
        const signature = signRequest(queryString, BINANCE_API_SECRET);

        const url = `${BINANCE_PROXY_URL}/sapi/v1/c2c/ads/update?${queryString}&signature=${signature}`;
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload.adData),
        });
        result = await response.json();
        break;
      }

      case "updateAdStatus": {
        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}`;
        const signature = signRequest(queryString, BINANCE_API_SECRET);

        const url = `${BINANCE_PROXY_URL}/sapi/v1/c2c/ads/updateStatus?${queryString}&signature=${signature}`;
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            advNos: payload.advNos,
            advStatus: payload.advStatus,
          }),
        });
        result = await response.json();
        break;
      }

      case "getReferencePrice": {
        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}`;
        const signature = signRequest(queryString, BINANCE_API_SECRET);

        const url = `${BINANCE_PROXY_URL}/sapi/v1/c2c/ads/getReferencePrice?${queryString}&signature=${signature}`;
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            assets: payload.assets || ["USDT"],
            fiatCurrency: payload.fiatCurrency || "INR",
            tradeType: payload.tradeType || "SELL",
          }),
        });
        result = await response.json();
        break;
      }

      case "getPaymentMethods": {
        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}`;
        const signature = signRequest(queryString, BINANCE_API_SECRET);

        const url = `${BINANCE_PROXY_URL}/sapi/v1/c2c/paymentMethod/listByUserId?${queryString}&signature=${signature}`;
        const response = await fetch(url, {
          method: "POST",
          headers,
        });
        result = await response.json();
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("binance-ads error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
