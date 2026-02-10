import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BINANCE_BASE = "https://api.binance.com";

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
        console.warn(`fetchWithRetry: attempt ${attempt + 1} failed (${msg}), retrying...`);
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

    if (!BINANCE_PROXY_URL || !BINANCE_API_KEY || !BINANCE_API_SECRET || !BINANCE_PROXY_TOKEN) {
      throw new Error("Missing Binance configuration secrets");
    }

    const { action, ...payload } = await req.json();
    console.log("binance-assets action:", action, "payload keys:", Object.keys(payload));

    const proxyHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-proxy-token": BINANCE_PROXY_TOKEN,
      "x-api-key": BINANCE_API_KEY,
      "x-api-secret": BINANCE_API_SECRET,
      "clientType": "web",
    };

    // Helper: call proxy with params as URL query string (proxy passes these through for SAPI)
    async function proxyCall(path: string, params: Record<string, string> = {}): Promise<any> {
      const qs = new URLSearchParams(params).toString();
      const url = qs
        ? `${BINANCE_PROXY_URL}/api${path}?${qs}`
        : `${BINANCE_PROXY_URL}/api${path}`;
      console.log(`proxyCall POST ${path} params:`, Object.keys(params));
      const res = await fetchWithRetry(url, {
        method: "POST",
        headers: proxyHeaders,
      });
      const text = await res.text();
      console.log(`proxyCall response ${res.status}:`, text.substring(0, 500));
      try {
        return JSON.parse(text);
      } catch {
        return { error: text };
      }
    }

    let result: any;

    switch (action) {
      // ===== GET ALL BALANCES (Funding + Spot) =====
      case "getBalances": {
        // Funding wallet (SAPI - no params needed)
        const fundingData = await proxyCall("/sapi/v1/asset/get-funding-asset");
        const fundingList = Array.isArray(fundingData) ? fundingData : [];

        // Spot account (GET via proxy)
        let spotData: any = {};
        try {
          const spotUrl = `${BINANCE_PROXY_URL}/api/api/v3/account`;
          const spotRes = await fetchWithRetry(spotUrl, {
            method: "GET",
            headers: proxyHeaders,
          });
          const spotText = await spotRes.text();
          console.log("Spot response status:", spotRes.status);
          spotData = JSON.parse(spotText);
        } catch (e) {
          console.error("Spot account error:", e);
        }

        const spotBalances: any[] = spotData?.balances || [];

        // Merge balances
        const assetMap = new Map<string, { asset: string; funding_free: number; funding_locked: number; funding_freeze: number; spot_free: number; spot_locked: number }>();

        for (const item of fundingList) {
          const asset = item.asset;
          const existing = assetMap.get(asset) || { asset, funding_free: 0, funding_locked: 0, funding_freeze: 0, spot_free: 0, spot_locked: 0 };
          existing.funding_free = parseFloat(item.free || "0");
          existing.funding_locked = parseFloat(item.locked || "0");
          existing.funding_freeze = parseFloat(item.freeze || "0");
          assetMap.set(asset, existing);
        }

        for (const item of spotBalances) {
          const asset = item.asset;
          const free = parseFloat(item.free || "0");
          const locked = parseFloat(item.locked || "0");
          if (free === 0 && locked === 0) continue;
          const existing = assetMap.get(asset) || { asset, funding_free: 0, funding_locked: 0, funding_freeze: 0, spot_free: 0, spot_locked: 0 };
          existing.spot_free = free;
          existing.spot_locked = locked;
          assetMap.set(asset, existing);
        }

        const balances = Array.from(assetMap.values())
          .map((b) => ({
            ...b,
            total_free: b.funding_free + b.spot_free,
            total_locked: b.funding_locked + b.spot_locked + b.funding_freeze,
            total_balance: b.funding_free + b.funding_locked + b.funding_freeze + b.spot_free + b.spot_locked,
          }))
          .filter((b) => b.total_balance > 0)
          .sort((a, b) => b.total_balance - a.total_balance);

        result = { balances, raw_funding: fundingList, raw_spot: spotBalances };
        break;
      }

      // ===== INTERNAL TRANSFER =====
      case "transfer": {
        const { asset, amount, type } = payload;
        if (!asset || !amount || !type) throw new Error("Missing required fields: asset, amount, type");
        result = await proxyCall("/sapi/v1/asset/transfer", { type, asset, amount: String(amount) });
        break;
      }

      // ===== SPOT MARKET ORDER =====
      case "spotOrder": {
        const { symbol, side, quantity, quoteOrderQty } = payload;
        if (!symbol || !side) throw new Error("Missing: symbol, side");
        const params: Record<string, string> = { symbol, side, type: "MARKET" };
        if (quoteOrderQty) params.quoteOrderQty = String(quoteOrderQty);
        else if (quantity) params.quantity = String(quantity);
        else throw new Error("Either quantity or quoteOrderQty required");

        const qs2 = new URLSearchParams(params).toString();
        const url2 = `${BINANCE_PROXY_URL}/api/api/v3/order?${qs2}`;
        const res2 = await fetchWithRetry(url2, { method: "POST", headers: proxyHeaders });
        result = JSON.parse(await res2.text());
        break;
      }

      // ===== AUTO-TRANSFER + SPOT ORDER =====
      case "executeTradeWithTransfer": {
        const { symbol, side, quantity, quoteOrderQty, transferAsset } = payload;

        // Step 1: Auto-transfer from Funding→Spot if needed
        let transferResult = null;
        let fundingTransferred = false;
        const assetToCheck = transferAsset;

        if (assetToCheck) {
          try {
            const fundCheckData = await proxyCall("/sapi/v1/asset/get-funding-asset", { asset: assetToCheck });
            const fundingBalance = Array.isArray(fundCheckData)
              ? fundCheckData.find((f: any) => f.asset === assetToCheck)
              : null;
            const fundingFree = parseFloat(fundingBalance?.free || "0");

            if (fundingFree > 0) {
              transferResult = await proxyCall("/sapi/v1/asset/transfer", {
                type: "FUNDING_MAIN",
                asset: assetToCheck,
                amount: String(fundingFree),
              });
              console.log("Auto-transfer result:", JSON.stringify(transferResult));
              fundingTransferred = true;
              await new Promise((r) => setTimeout(r, 500));
            }
          } catch (e) {
            console.error("Transfer error:", e);
          }
        }

        // Step 2: Execute spot market order via proxy
        if (!symbol || !side) throw new Error("Missing: symbol, side");
        const orderParams: Record<string, string> = { symbol, side, type: "MARKET" };
        if (quoteOrderQty) orderParams.quoteOrderQty = String(quoteOrderQty);
        else if (quantity) orderParams.quantity = String(quantity);
        else throw new Error("Either quantity or quoteOrderQty required");

        const orderQs = new URLSearchParams(orderParams).toString();
        const orderUrl = `${BINANCE_PROXY_URL}/api/api/v3/order?${orderQs}`;
        console.log("Spot order URL:", orderUrl);
        const orderRes = await fetchWithRetry(orderUrl, { method: "POST", headers: proxyHeaders });
        const orderResult = JSON.parse(await orderRes.text());
        console.log("Spot order result:", JSON.stringify(orderResult));

        if (orderResult?.code && orderResult.code < 0) {
          throw new Error(orderResult.msg || `Spot order failed: ${orderResult.code}`);
        }

        result = {
          transfer: transferResult,
          order: orderResult,
          fundingTransferred,
          method: "SPOT",
        };
        break;
      }

      // ===== SPOT ORDER via proxy query params (api/v3) =====
      case "spotOrderDirect": {
        const { symbol, side, quantity, quoteOrderQty } = payload;
        if (!symbol || !side) throw new Error("Missing: symbol, side");
        const params: Record<string, string> = { symbol, side, type: "MARKET" };
        if (quoteOrderQty) params.quoteOrderQty = String(quoteOrderQty);
        else if (quantity) params.quantity = String(quantity);
        else throw new Error("Either quantity or quoteOrderQty required");

        const qs = new URLSearchParams(params).toString();
        const url = `${BINANCE_PROXY_URL}/api/api/v3/order?${qs}`;
        const res = await fetchWithRetry(url, { method: "POST", headers: proxyHeaders });
        result = JSON.parse(await res.text());
        break;
      }

      // ===== TICKER PRICE (public) =====
      case "getTickerPrice": {
        const { symbol } = payload;
        const tickerUrl = symbol
          ? `${BINANCE_BASE}/api/v3/ticker/price?symbol=${symbol}`
          : `${BINANCE_BASE}/api/v3/ticker/price`;
        const tickerRes = await fetchWithRetry(tickerUrl, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        result = JSON.parse(await tickerRes.text());
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("binance-assets error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
