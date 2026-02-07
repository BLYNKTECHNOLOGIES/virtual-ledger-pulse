import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function signQuery(queryString: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(queryString);
  return hmac.digest("hex");
}

// Build signed URL for Binance SAPI C2C endpoints
// C2C SAPI: signature is computed over query params only (not body)
// Body is sent as JSON separately
function buildSignedUrl(
  proxyUrl: string,
  path: string,
  secret: string,
  extraParams: Record<string, string> = {}
): string {
  const timestamp = Date.now();
  const params: Record<string, string> = { ...extraParams, timestamp: String(timestamp) };
  const queryString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const signature = signQuery(queryString, secret);
  return `${proxyUrl}${path}?${queryString}&signature=${signature}`;
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
    console.log("binance-ads action:", action, "payload keys:", Object.keys(payload));

    const headers: Record<string, string> = {
      "X-MBX-APIKEY": BINANCE_API_KEY,
      "Content-Type": "application/json",
      "clientType": "web",
    };

    let result: any;

    switch (action) {
      case "listAds": {
        const body: Record<string, any> = {
          page: payload.page || 1,
          rows: payload.rows || 20,
        };
        if (payload.asset) body.asset = payload.asset;
        if (payload.tradeType) body.tradeType = payload.tradeType;
        if (payload.advStatus !== undefined && payload.advStatus !== null) body.advStatus = payload.advStatus;
        if (payload.startDate) body.startDate = payload.startDate;
        if (payload.endDate) body.endDate = payload.endDate;
        if (payload.fiatUnit) body.fiatUnit = payload.fiatUnit;

        const url = buildSignedUrl(BINANCE_PROXY_URL, "/sapi/v1/c2c/ads/listWithPagination", BINANCE_API_SECRET);
        console.log("listAds URL:", url);
        console.log("listAds body:", JSON.stringify(body));

        const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
        const text = await response.text();
        console.log("listAds response status:", response.status, "body:", text);
        try {
          result = JSON.parse(text);
        } catch {
          result = { raw: text, status: response.status };
        }
        break;
      }

      case "getAdDetail": {
        // adsNo goes as query param for this endpoint
        const url = buildSignedUrl(
          BINANCE_PROXY_URL,
          "/sapi/v1/c2c/ads/getDetailByNo",
          BINANCE_API_SECRET,
          { adsNo: payload.adsNo }
        );
        console.log("getAdDetail URL:", url);

        const response = await fetch(url, { method: "POST", headers });
        const text = await response.text();
        console.log("getAdDetail response:", response.status, text);
        try {
          result = JSON.parse(text);
        } catch {
          result = { raw: text, status: response.status };
        }
        break;
      }

      case "postAd": {
        const url = buildSignedUrl(BINANCE_PROXY_URL, "/sapi/v1/c2c/ads/post", BINANCE_API_SECRET);
        console.log("postAd body:", JSON.stringify(payload.adData));

        const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload.adData) });
        const text = await response.text();
        console.log("postAd response:", response.status, text);
        try {
          result = JSON.parse(text);
        } catch {
          result = { raw: text, status: response.status };
        }
        break;
      }

      case "updateAd": {
        const url = buildSignedUrl(BINANCE_PROXY_URL, "/sapi/v1/c2c/ads/update", BINANCE_API_SECRET);

        const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload.adData) });
        const text = await response.text();
        console.log("updateAd response:", response.status, text);
        try {
          result = JSON.parse(text);
        } catch {
          result = { raw: text, status: response.status };
        }
        break;
      }

      case "updateAdStatus": {
        const url = buildSignedUrl(BINANCE_PROXY_URL, "/sapi/v1/c2c/ads/updateStatus", BINANCE_API_SECRET);

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            advNos: payload.advNos,
            advStatus: payload.advStatus,
          }),
        });
        const text = await response.text();
        console.log("updateAdStatus response:", response.status, text);
        try {
          result = JSON.parse(text);
        } catch {
          result = { raw: text, status: response.status };
        }
        break;
      }

      case "getReferencePrice": {
        const url = buildSignedUrl(BINANCE_PROXY_URL, "/sapi/v1/c2c/ads/getReferencePrice", BINANCE_API_SECRET);

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            assets: payload.assets || ["USDT"],
            fiatCurrency: payload.fiatCurrency || "INR",
            tradeType: payload.tradeType || "SELL",
          }),
        });
        const text = await response.text();
        console.log("getReferencePrice response:", response.status, text);
        try {
          result = JSON.parse(text);
        } catch {
          result = { raw: text, status: response.status };
        }
        break;
      }

      case "getPaymentMethods": {
        const url = buildSignedUrl(BINANCE_PROXY_URL, "/sapi/v1/c2c/paymentMethod/listByUserId", BINANCE_API_SECRET);

        const response = await fetch(url, { method: "POST", headers });
        const text = await response.text();
        console.log("getPaymentMethods response:", response.status, text);
        try {
          result = JSON.parse(text);
        } catch {
          result = { raw: text, status: response.status };
        }
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Check for Binance-level errors
    const isError = result?.code && result.code !== "000000" && result.code !== 200;
    return new Response(
      JSON.stringify({ 
        success: !isError, 
        data: result,
        ...(isError ? { error: result.message || "Binance API error" } : {})
      }),
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
