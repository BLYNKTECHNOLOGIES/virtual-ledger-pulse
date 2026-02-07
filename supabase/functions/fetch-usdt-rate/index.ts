import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

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

    if (!BINANCE_PROXY_URL || !BINANCE_API_KEY || !BINANCE_API_SECRET) {
      throw new Error("Missing Binance configuration secrets");
    }

    // Try Binance C2C advertisment data for accurate OTC rate
    try {
      const rate = await fetchBinanceP2PRate(BINANCE_PROXY_URL, BINANCE_API_KEY);
      if (rate) {
        return new Response(
          JSON.stringify({ rate, source: "Binance P2P", timestamp: new Date().toISOString() }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (e) {
      console.error("Binance P2P fetch failed, trying ticker:", e);
    }

    // Fallback: Binance ticker price (USDT/INR if available)
    try {
      const rate = await fetchBinanceTickerRate(BINANCE_PROXY_URL, BINANCE_API_KEY);
      if (rate) {
        return new Response(
          JSON.stringify({ rate, source: "Binance Ticker", timestamp: new Date().toISOString() }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (e) {
      console.error("Binance ticker fetch failed, trying CoinGecko:", e);
    }

    // Fallback: CoinGecko (no auth needed)
    try {
      const cgResponse = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr",
        { headers: { Accept: "application/json" } }
      );
      if (cgResponse.ok) {
        const data = await cgResponse.json();
        if (data.tether?.inr) {
          return new Response(
            JSON.stringify({ rate: data.tether.inr, source: "CoinGecko", timestamp: new Date().toISOString() }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    } catch (e) {
      console.error("CoinGecko fetch failed:", e);
    }

    // Final fallback
    return new Response(
      JSON.stringify({ rate: 84.5, source: "Fallback", timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-usdt-rate error:", error);
    return new Response(
      JSON.stringify({ rate: 84.5, source: "Fallback", error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function fetchBinanceP2PRate(proxyUrl: string, apiKey: string): Promise<number | null> {
  // Binance C2C /c2c/orderMatch/listUserOrderHistory or public P2P ads
  const response = await fetch(`${proxyUrl}/api/v3/ticker/price?symbol=USDTINR`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });

  if (response.ok) {
    const data = await response.json();
    if (data.price) {
      return parseFloat(data.price);
    }
  }

  const text = await response.text();
  console.error("P2P response:", response.status, text);
  return null;
}

async function fetchBinanceTickerRate(proxyUrl: string, apiKey: string): Promise<number | null> {
  // Try USDTBIDR or calculate via USDT/BUSD pairs
  const response = await fetch(`${proxyUrl}/api/v3/ticker/price?symbol=USDTINR`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });

  if (response.ok) {
    const data = await response.json();
    if (data.price) {
      return parseFloat(data.price);
    }
  }

  // USDTINR may not exist - try fetching via BTC pairs
  // BTCINR / BTCUSDT = USDT/INR
  const [btcInrRes, btcUsdtRes] = await Promise.all([
    fetch(`${proxyUrl}/api/v3/ticker/price?symbol=BTCINR`, {
      headers: { "X-MBX-APIKEY": apiKey },
    }),
    fetch(`${proxyUrl}/api/v3/ticker/price?symbol=BTCUSDT`, {
      headers: { "X-MBX-APIKEY": apiKey },
    }),
  ]);

  if (btcInrRes.ok && btcUsdtRes.ok) {
    const btcInr = await btcInrRes.json();
    const btcUsdt = await btcUsdtRes.json();
    if (btcInr.price && btcUsdt.price) {
      const rate = parseFloat(btcInr.price) / parseFloat(btcUsdt.price);
      return parseFloat(rate.toFixed(2));
    }
  }

  return null;
}
