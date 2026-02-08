import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    if (!BINANCE_PROXY_URL || !BINANCE_API_KEY || !BINANCE_API_SECRET || !BINANCE_PROXY_TOKEN) {
      throw new Error("Missing Binance configuration secrets");
    }

    const { action, ...payload } = await req.json();
    console.log("binance-ads action:", action, "payload keys:", Object.keys(payload));

    // The proxy handles signing internally — we pass API key & secret as headers
    const proxyHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-proxy-token": BINANCE_PROXY_TOKEN,
      "x-api-key": BINANCE_API_KEY,
      "x-api-secret": BINANCE_API_SECRET,
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

        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/ads/listWithPagination`;
        console.log("listAds URL:", url);
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(body) });
        const text = await response.text();
        console.log("listAds response status:", response.status, "body:", text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "getAdDetail": {
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/ads/getDetailByNo?adsNo=${payload.adsNo}`;
        const response = await fetch(url, { method: "POST", headers: proxyHeaders });
        const text = await response.text();
        console.log("getAdDetail response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "postAd": {
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/ads/post`;
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(payload.adData) });
        const text = await response.text();
        console.log("postAd response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "updateAd": {
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/ads/update`;
        console.log("updateAd request body:", JSON.stringify(payload.adData).substring(0, 1000));
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(payload.adData) });
        const text = await response.text();
        console.log("updateAd response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "updateAdStatus": {
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/ads/updateStatus`;
        // Per official docs: advNos is an array of strings, advStatus is a number
        const advNosList = Array.isArray(payload.advNos) ? payload.advNos : [payload.advNos];
        const body = {
          advNos: advNosList.map(String),
          advStatus: Number(payload.advStatus),
        };
        console.log("updateAdStatus request body:", JSON.stringify(body));
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(body) });
        const text = await response.text();
        console.log("updateAdStatus response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "getReferencePrice": {
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/ads/getReferencePrice`;
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify({
          assets: payload.assets || ["USDT"],
          fiatCurrency: payload.fiatCurrency || "INR",
          tradeType: payload.tradeType || "SELL",
        }) });
        const text = await response.text();
        console.log("getReferencePrice response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "getPaymentMethods": {
        // Try primary path first, then fallback
        const paths = [
          `/api/sapi/v1/c2c/paymentMethod/list`,
          `/api/sapi/v1/c2c/paymentMethod/listByUserId`,
          `/api/bapi/c2c/v1/private/paymentMethod/list`,
        ];
        let finalResult: any = null;
        for (const path of paths) {
          const url = `${BINANCE_PROXY_URL}${path}`;
          console.log("getPaymentMethods trying:", url);
          const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify({}) });
          const text = await response.text();
          console.log("getPaymentMethods response:", response.status, text.substring(0, 800));
          try { finalResult = JSON.parse(text); } catch { finalResult = { raw: text, status: response.status }; }
          // If we got a valid response (not 404), use it
          if (response.status !== 404 && !(finalResult?.status === 404)) break;
        }
        result = finalResult;
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

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
