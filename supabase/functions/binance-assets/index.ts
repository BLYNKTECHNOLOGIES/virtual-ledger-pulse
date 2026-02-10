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

    let result: any;

    switch (action) {
      // ===== GET ALL BALANCES (Funding + Spot) =====
      case "getBalances": {
        // Fetch funding wallet balances
        const fundingUrl = `${BINANCE_PROXY_URL}/api/sapi/v1/asset/get-funding-asset`;
        const fundingRes = await fetchWithRetry(fundingUrl, {
          method: "POST",
          headers: proxyHeaders,
          body: JSON.stringify({}),
        });
        const fundingText = await fundingRes.text();
        console.log("Funding response status:", fundingRes.status);
        let fundingData: any[] = [];
        try {
          fundingData = JSON.parse(fundingText);
          if (!Array.isArray(fundingData)) fundingData = [];
        } catch { fundingData = []; }

        // Fetch spot account balances
        const spotUrl = `${BINANCE_PROXY_URL}/api/api/v3/account`;
        const spotRes = await fetchWithRetry(spotUrl, {
          method: "GET",
          headers: proxyHeaders,
        });
        const spotText = await spotRes.text();
        console.log("Spot response status:", spotRes.status);
        let spotData: any = {};
        try {
          spotData = JSON.parse(spotText);
        } catch { spotData = {}; }

        const spotBalances: any[] = spotData?.balances || [];

        // Merge balances by asset
        const assetMap = new Map<string, { asset: string; funding_free: number; funding_locked: number; funding_freeze: number; spot_free: number; spot_locked: number; }>();

        for (const item of fundingData) {
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
          if (free === 0 && locked === 0) continue; // Skip zero spot balances
          const existing = assetMap.get(asset) || { asset, funding_free: 0, funding_locked: 0, funding_freeze: 0, spot_free: 0, spot_locked: 0 };
          existing.spot_free = free;
          existing.spot_locked = locked;
          assetMap.set(asset, existing);
        }

        // Convert to array with totals
        const balances = Array.from(assetMap.values())
          .map((b) => ({
            ...b,
            total_free: b.funding_free + b.spot_free,
            total_locked: b.funding_locked + b.spot_locked + b.funding_freeze,
            total_balance: b.funding_free + b.funding_locked + b.funding_freeze + b.spot_free + b.spot_locked,
          }))
          .filter((b) => b.total_balance > 0)
          .sort((a, b) => b.total_balance - a.total_balance);

        result = { balances, raw_funding: fundingData, raw_spot: spotBalances };
        break;
      }

      // ===== INTERNAL TRANSFER (Funding <-> Spot) =====
      case "transfer": {
        const { asset, amount, type } = payload;
        // type: FUNDING_MAIN (funding→spot) or MAIN_FUNDING (spot→funding)
        if (!asset || !amount || !type) {
          throw new Error("Missing required fields: asset, amount, type");
        }
        const transferUrl = `${BINANCE_PROXY_URL}/api/sapi/v1/asset/transfer`;
        const transferRes = await fetchWithRetry(transferUrl, {
          method: "POST",
          headers: proxyHeaders,
          body: JSON.stringify({ type, asset, amount: String(amount) }),
        });
        const transferText = await transferRes.text();
        console.log("Transfer response:", transferRes.status, transferText);
        result = JSON.parse(transferText);
        break;
      }

      // ===== SPOT MARKET ORDER =====
      case "spotOrder": {
        const { symbol, side, quantity, quoteOrderQty } = payload;
        if (!symbol || !side) {
          throw new Error("Missing required fields: symbol, side");
        }
        
        const orderBody: any = {
          symbol,
          side, // BUY or SELL
          type: "MARKET",
        };
        
        // For BUY with quoteOrderQty (spend X USDT), for SELL with quantity
        if (quoteOrderQty) {
          orderBody.quoteOrderQty = String(quoteOrderQty);
        } else if (quantity) {
          orderBody.quantity = String(quantity);
        } else {
          throw new Error("Either quantity or quoteOrderQty must be provided");
        }

        const orderUrl = `${BINANCE_PROXY_URL}/api/api/v3/order`;
        const orderRes = await fetchWithRetry(orderUrl, {
          method: "POST",
          headers: proxyHeaders,
          body: JSON.stringify(orderBody),
        });
        const orderText = await orderRes.text();
        console.log("Spot order response:", orderRes.status, orderText);
        result = JSON.parse(orderText);
        break;
      }

      // ===== AUTO-TRANSFER + SPOT ORDER (seamless) =====
      case "executeTradeWithTransfer": {
        const { symbol, side, quantity, quoteOrderQty, asset: transferAsset } = payload;
        
        // Determine which asset needs to be in spot wallet
        // For BUY BTCUSDT: need USDT in spot. For SELL BTCUSDT: need BTC in spot.
        const assetToTransfer = transferAsset;
        
        if (!assetToTransfer) {
          throw new Error("transferAsset is required");
        }

        // Step 1: Check funding wallet for this asset
        const fundCheckUrl = `${BINANCE_PROXY_URL}/api/sapi/v1/asset/get-funding-asset`;
        const fundCheckRes = await fetchWithRetry(fundCheckUrl, {
          method: "POST",
          headers: proxyHeaders,
          body: JSON.stringify({ asset: assetToTransfer }),
        });
        const fundCheckData = JSON.parse(await fundCheckRes.text());
        const fundingBalance = Array.isArray(fundCheckData) 
          ? fundCheckData.find((f: any) => f.asset === assetToTransfer)
          : null;
        
        let transferResult = null;
        const fundingFree = parseFloat(fundingBalance?.free || "0");
        
        if (fundingFree > 0) {
          // Transfer all available from funding to spot
          const trUrl = `${BINANCE_PROXY_URL}/api/sapi/v1/asset/transfer`;
          const trRes = await fetchWithRetry(trUrl, {
            method: "POST",
            headers: proxyHeaders,
            body: JSON.stringify({
              type: "FUNDING_MAIN",
              asset: assetToTransfer,
              amount: String(fundingFree),
            }),
          });
          transferResult = JSON.parse(await trRes.text());
          console.log("Auto-transfer result:", JSON.stringify(transferResult));
          
          // Small delay to let balance settle
          await new Promise((r) => setTimeout(r, 500));
        }

        // Step 2: Execute the spot market order
        const orderBody2: any = {
          symbol,
          side,
          type: "MARKET",
        };
        if (quoteOrderQty) {
          orderBody2.quoteOrderQty = String(quoteOrderQty);
        } else if (quantity) {
          orderBody2.quantity = String(quantity);
        }

        const orderUrl2 = `${BINANCE_PROXY_URL}/api/api/v3/order`;
        const orderRes2 = await fetchWithRetry(orderUrl2, {
          method: "POST",
          headers: proxyHeaders,
          body: JSON.stringify(orderBody2),
        });
        const orderResult = JSON.parse(await orderRes2.text());
        console.log("Trade result:", JSON.stringify(orderResult));

        result = {
          transfer: transferResult,
          order: orderResult,
          fundingTransferred: fundingFree > 0,
        };
        break;
      }

      // ===== GET SPOT TICKER PRICE =====
      case "getTickerPrice": {
        const { symbol } = payload;
        const tickerUrl = symbol
          ? `${BINANCE_PROXY_URL}/api/api/v3/ticker/price?symbol=${symbol}`
          : `${BINANCE_PROXY_URL}/api/api/v3/ticker/price`;
        const tickerRes = await fetchWithRetry(tickerUrl, {
          method: "GET",
          headers: proxyHeaders,
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
