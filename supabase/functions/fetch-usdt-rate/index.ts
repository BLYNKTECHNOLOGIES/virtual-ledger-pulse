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

    // Priority 1: Binance P2P / ticker
    try {
      const rate = await fetchBinanceP2PRate(BINANCE_PROXY_URL, BINANCE_API_KEY);
      if (rate) {
        return jsonResponse({ rate, source: "Binance P2P", timestamp: new Date().toISOString() });
      }
    } catch (e) {
      console.error("Binance P2P fetch failed:", e);
    }

    // Priority 2: Binance ticker (cross-rate via BTC)
    try {
      const rate = await fetchBinanceTickerRate(BINANCE_PROXY_URL, BINANCE_API_KEY);
      if (rate) {
        return jsonResponse({ rate, source: "Binance Ticker", timestamp: new Date().toISOString() });
      }
    } catch (e) {
      console.error("Binance ticker fetch failed:", e);
    }

    // Fallback 1: CryptoCompare (free, no auth, direct USDT→INR)
    try {
      const rate = await fetchCryptoCompareRate();
      if (rate) {
        return jsonResponse({ rate, source: "CryptoCompare", timestamp: new Date().toISOString() });
      }
    } catch (e) {
      console.error("CryptoCompare fetch failed:", e);
    }

    // Fallback 2: CoinGecko (free, no auth)
    try {
      const cgResponse = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr",
        { headers: { Accept: "application/json" } }
      );
      if (cgResponse.ok) {
        const data = await cgResponse.json();
        if (data.tether?.inr) {
          return jsonResponse({ rate: data.tether.inr, source: "CoinGecko", timestamp: new Date().toISOString() });
        }
      }
    } catch (e) {
      console.error("CoinGecko fetch failed:", e);
    }

    // Fallback 3: CoinCap + ExchangeRate-API cross-rate (USDT→USD * USD→INR)
    try {
      const rate = await fetchCoinCapCrossRate();
      if (rate) {
        return jsonResponse({ rate, source: "CoinCap+ER-API", timestamp: new Date().toISOString() });
      }
    } catch (e) {
      console.error("CoinCap cross-rate fetch failed:", e);
    }

    // All sources exhausted — return unavailable
    console.error("All USDT/INR price sources failed");
    return jsonResponse({ rate: null, source: "Unavailable", timestamp: new Date().toISOString(), error: "All price sources failed" });

  } catch (error) {
    console.error("fetch-usdt-rate error:", error);
    return jsonResponse(
      { rate: null, source: "Unavailable", error: error instanceof Error ? error.message : "Unknown error" },
      200
    );
  }
});

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchCryptoCompareRate(): Promise<number | null> {
  const response = await fetch(
    "https://min-api.cryptocompare.com/data/price?fsym=USDT&tsyms=INR",
    { headers: { Accept: "application/json" } }
  );
  if (response.ok) {
    const data = await response.json();
    if (data.INR && typeof data.INR === "number" && data.INR > 0) {
      return parseFloat(data.INR.toFixed(2));
    }
  }
  return null;
}

async function fetchCoinCapCrossRate(): Promise<number | null> {
  // CoinCap gives USDT price in USD, then convert USD→INR via free forex API
  const [capRes, fxRes] = await Promise.all([
    fetch("https://api.coincap.io/v2/rates/tether", { headers: { Accept: "application/json" } }),
    fetch("https://open.er-api.com/v6/latest/USD", { headers: { Accept: "application/json" } }),
  ]);

  if (capRes.ok && fxRes.ok) {
    const capData = await capRes.json();
    const fxData = await fxRes.json();
    const usdtUsd = parseFloat(capData?.data?.rateUsd);
    const usdInr = fxData?.rates?.INR;
    if (usdtUsd > 0 && usdInr > 0) {
      return parseFloat((usdtUsd * usdInr).toFixed(2));
    }
  }
  return null;
}

async function fetchBinanceP2PRate(proxyUrl: string, apiKey: string): Promise<number | null> {
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
