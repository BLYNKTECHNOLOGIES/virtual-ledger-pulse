import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Retry wrapper for transient network errors (connection closed, timeouts)
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
      // Only retry on transient network errors
      if (
        msg.includes("connection closed") ||
        msg.includes("ConnectionReset") ||
        msg.includes("SendRequest") ||
        msg.includes("ECONNRESET")
      ) {
        console.warn(`fetchWithRetry: attempt ${attempt + 1} failed (${msg}), retrying in ${delayMs}ms...`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
          continue;
        }
      }
      throw err; // Non-transient error, throw immediately
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
    console.log("binance-ads action:", action, "payload keys:", Object.keys(payload));

    const proxyHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-proxy-token": BINANCE_PROXY_TOKEN,
      "x-api-key": BINANCE_API_KEY,
      "x-api-secret": BINANCE_API_SECRET,
      "clientType": "web",
    };

    let result: any;

    switch (action) {
      // ==================== ADS ====================
      case "listAds": {
        const body: Record<string, any> = {
          page: payload.page || 1,
          rows: payload.rows || 20,
        };
        if (payload.asset) body.asset = payload.asset;
        if (payload.tradeType) body.tradeType = payload.tradeType;
        // Binance only recognizes advStatus 1 (online) and 3 (offline).
        // Status 2 (private) is our custom enrichment; map it back to 1 for the API call.
        if (payload.advStatus !== undefined && payload.advStatus !== null) {
          body.advStatus = payload.advStatus === 2 ? 1 : payload.advStatus;
        }
        if (payload.startDate) body.startDate = payload.startDate;
        if (payload.endDate) body.endDate = payload.endDate;
        if (payload.fiatUnit) body.fiatUnit = payload.fiatUnit;

        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/ads/listWithPagination`;
        console.log("listAds URL:", url);
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(body) });
        const text = await response.text();
        console.log("listAds response status:", response.status, "body:", text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }

        // Enrich ads that have advStatus=1 with visibility info from getDetailByNo
        // Binance marks "Private" ads as advStatus=1 + advVisibleRet.userSetVisible=1
        // The listWithPagination API does NOT include advVisibleRet, so we fetch detail for each
        if (result?.data && Array.isArray(result.data)) {
          const onlineAds = result.data.filter((ad: any) => ad.advStatus === 1);
          if (onlineAds.length > 0) {
            console.log(`Enriching ${onlineAds.length} online ads with visibility data...`);
            const detailPromises = onlineAds.map((ad: any) =>
              fetch(`${BINANCE_PROXY_URL}/api/sapi/v1/c2c/ads/getDetailByNo?adsNo=${ad.advNo}`, {
                method: "POST", headers: proxyHeaders,
              })
                .then(r => r.json())
                .then(detail => {
                  const vis = detail?.data?.advVisibleRet;
                  if (vis && vis.userSetVisible === 1) {
                    ad.advStatus = 2; // Mark as Private
                    ad._isPrivate = true;
                  }
                  ad.advVisibleRet = vis || null;
                })
                .catch(err => {
                  console.warn(`Failed to get detail for ${ad.advNo}:`, err.message);
                })
            );
            await Promise.all(detailPromises);
          }
        }
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
        const adData = { ...payload.adData };
        // Binance only accepts advStatus 1 (online) or 3 (offline) for ad creation.
        // Our custom status 2 (Private) must be mapped to 1 for the API call.
        if (adData.advStatus === 2) {
          adData.advStatus = 1;
        }
        console.log("postAd request body:", JSON.stringify(adData).substring(0, 1000));
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/ads/post`;
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(adData) });
        const text = await response.text();
        console.log("postAd response:", response.status, text);
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
        // Per doc: GET /sapi/v1/c2c/paymentMethod/getPayMethodByUserId
        const paths = [
          `/api/sapi/v1/c2c/paymentMethod/getPayMethodByUserId`,
          `/api/sapi/v1/c2c/paymentMethod/list`,
          `/api/sapi/v1/c2c/paymentMethod/listByUserId`,
          `/api/bapi/c2c/v1/private/paymentMethod/list`,
        ];
        let finalResult: any = null;
        for (const path of paths) {
          const url = `${BINANCE_PROXY_URL}${path}`;
          console.log("getPaymentMethods trying:", url);
          // First path is GET per API doc, rest are POST
          const method = path.includes("getPayMethodByUserId") ? "GET" : "POST";
          const response = await fetch(url, { 
            method, 
            headers: proxyHeaders, 
            ...(method === "POST" ? { body: JSON.stringify({}) } : {}),
          });
          const text = await response.text();
          console.log("getPaymentMethods response:", response.status, text.substring(0, 800));
          try { finalResult = JSON.parse(text); } catch { finalResult = { raw: text, status: response.status }; }
          if (response.status !== 404 && !(finalResult?.status === 404)) break;
        }
        result = finalResult;
        break;
      }

      // ==================== ORDERS ====================
      case "getOrderHistory": {
        // GET endpoint — Binance rejects POST for this route
        const ohParams = new URLSearchParams({
          page: String(payload.page || 1),
          rows: String(payload.rows || 100),
        });
        if (payload.tradeType) ohParams.set("tradeType", payload.tradeType);
        if (payload.startTimestamp) ohParams.set("startTimestamp", String(payload.startTimestamp));
        if (payload.endTimestamp) ohParams.set("endTimestamp", String(payload.endTimestamp));

        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/listUserOrderHistory?${ohParams.toString()}`;
        console.log("getOrderHistory URL (GET):", url);
        const response = await fetch(url, { method: "GET", headers: proxyHeaders });
        const text = await response.text();
        console.log("getOrderHistory response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "listActiveOrders": {
        // POST /sapi/v1/c2c/orderMatch/listOrders
        const body: Record<string, any> = {
          page: payload.page || 1,
          rows: payload.rows || 50,
        };
        if (payload.advNo) body.advNo = payload.advNo;
        if (payload.asset) body.asset = payload.asset;
        if (payload.tradeType) body.tradeType = payload.tradeType;
        if (payload.startDate) body.startDate = payload.startDate;
        if (payload.endDate) body.endDate = payload.endDate;

        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/listOrders`;
        console.log("listActiveOrders URL:", url);
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(body) });
        const text = await response.text();
        console.log("listActiveOrders response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "getOrderDetail": {
        // POST /sapi/v1/c2c/orderMatch/getUserOrderDetail
        // API requires "adOrderNo" in body (not "orderNumber")
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/getUserOrderDetail`;
        const response = await fetchWithRetry(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify({
          adOrderNo: payload.orderNumber,
        }) });
        const text = await response.text();
        console.log("getOrderDetail response:", response.status, text.substring(0, 2000));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "markOrderAsPaid": {
        // POST /sapi/v1/c2c/orderMatch/markOrderAsPaid
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/markOrderAsPaid`;
        const body: Record<string, any> = { orderNumber: payload.orderNumber };
        if (payload.payId) body.payId = payload.payId;
        console.log("markOrderAsPaid body:", JSON.stringify(body));
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(body) });
        const text = await response.text();
        console.log("markOrderAsPaid response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "releaseCoin": {
        // POST /sapi/v1/c2c/orderMatch/releaseCoin (API doc #29)
        // Body: ConfirmOrderPaidReq { orderNumber, authType, code, confirmPaidType }
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/releaseCoin`;
        const body: Record<string, any> = {
          orderNumber: payload.orderNumber,
        };
        if (payload.authType) body.authType = payload.authType;
        // Map the verification code to the 'code' field (API only accepts 'code', not separate fields)
        const verifyCode = payload.code || payload.googleVerifyCode || payload.emailVerifyCode || payload.mobileVerifyCode || payload.yubikeyVerifyCode;
        if (verifyCode) body.code = verifyCode;
        if (payload.confirmPaidType) body.confirmPaidType = payload.confirmPaidType;
        console.log("releaseCoin body:", JSON.stringify(body));
        const response = await fetchWithRetry(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(body) });
        const text = await response.text();
        console.log("releaseCoin response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "checkIfCanRelease": {
        // POST /sapi/v1/c2c/orderMatch/checkIfCanReleaseCoin (API doc #21)
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/checkIfCanReleaseCoin`;
        const body: Record<string, any> = {
          orderNumber: payload.orderNumber,
        };
        if (payload.authType) body.authType = payload.authType;
        if (payload.code) body.code = payload.code;
        if (payload.confirmPaidType) body.confirmPaidType = payload.confirmPaidType;
        if (payload.emailVerifyCode) body.emailVerifyCode = payload.emailVerifyCode;
        if (payload.googleVerifyCode) body.googleVerifyCode = payload.googleVerifyCode;
        if (payload.mobileVerifyCode) body.mobileVerifyCode = payload.mobileVerifyCode;
        if (payload.yubikeyVerifyCode) body.yubikeyVerifyCode = payload.yubikeyVerifyCode;
        if (payload.payId) body.payId = payload.payId;
        console.log("checkIfCanRelease body:", JSON.stringify(body));
        const response = await fetchWithRetry(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(body) });
        const text = await response.text();
        console.log("checkIfCanRelease response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "cancelOrder": {
        // POST /sapi/v1/c2c/orderMatch/cancelOrder
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/cancelOrder`;
        const body: Record<string, any> = {
          orderNumber: payload.orderNumber,
        };
        if (payload.orderCancelReasonCode !== undefined) body.orderCancelReasonCode = payload.orderCancelReasonCode;
        if (payload.orderCancelAdditionalInfo) body.orderCancelAdditionalInfo = payload.orderCancelAdditionalInfo;
        console.log("cancelOrder body:", JSON.stringify(body));
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(body) });
        const text = await response.text();
        console.log("cancelOrder response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "checkIfAllowedCancelOrder": {
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/checkIfAllowedCancelOrder`;
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify({
          orderNumber: payload.orderNumber,
        }) });
        const text = await response.text();
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      // ==================== COUNTERPARTY ====================
      case "queryCounterPartyStats": {
        // POST /sapi/v1/c2c/orderMatch/queryCounterPartyOrderStatistic
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/queryCounterPartyOrderStatistic`;
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify({
          orderNumber: payload.orderNumber,
        }) });
        const text = await response.text();
        console.log("queryCounterPartyStats response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "getUserOrderSummary": {
        // GET /sapi/v1/c2c/orderMatch/getUserOrderSummary
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/getUserOrderSummary`;
        const response = await fetch(url, { method: "GET", headers: proxyHeaders });
        const text = await response.text();
        console.log("getUserOrderSummary response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      // ==================== CHAT ====================
      case "getChatMessages": {
        // GET endpoint — same pattern as retrieveChatCredential
        const chatParams = new URLSearchParams({
          orderNo: payload.orderNo,
          page: String(payload.page || 1),
          rows: String(payload.rows || 50),
        });
        const chatUrl = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/chat/retrieveChatMessagesWithPagination?${chatParams.toString()}`;
        console.log("getChatMessages URL (GET):", chatUrl);
        const response = await fetchWithRetry(chatUrl, {
          method: "GET",
          headers: proxyHeaders,
        });
        const text = await response.text();
        console.log("getChatMessages response:", response.status, text.substring(0, 800));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "sendChatMessage": {
        // POST /sapi/v1/c2c/chat/sendMessage — proxy route uses query params: orderNo, content, contentType
        const msgContent = payload.imageUrl || payload.content || payload.message;
        const msgType = payload.imageUrl ? "IMAGE" : (payload.contentType || payload.chatMessageType || "TEXT");
        const sendMsgUrl = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/chat/sendMessage?orderNo=${encodeURIComponent(payload.orderNo)}&content=${encodeURIComponent(msgContent)}&contentType=${encodeURIComponent(msgType)}`;
        console.log("sendChatMessage URL:", sendMsgUrl);
        const response = await fetchWithRetry(sendMsgUrl, { 
          method: "POST", 
          headers: proxyHeaders,
        });
        const text = await response.text();
        console.log("sendChatMessage response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "getChatCredential": {
        // GET endpoint for retrieveChatCredential
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/chat/retrieveChatCredential`;
        console.log("getChatCredential URL (GET):", url);
        const response = await fetch(url, { 
          method: "GET", 
          headers: proxyHeaders,
        });
        const text = await response.text();
        console.log("getChatCredential response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        
        // Append relay connection info for the frontend WebSocket hook
        const relayUrl = "wss://relay.rewarnd.com";
        const relayToken = BINANCE_PROXY_TOKEN;
        if (result && typeof result === "object") {
          result._relay = { relayUrl, relayToken };
        }
        break;
      }

      case "getChatImageUploadUrl": {
        // POST /sapi/v1/c2c/chat/image/pre-signed-url
        // Try both: query param in URL + body JSON, so proxy can pick up imageName from either
        const imgName = payload.imageName || `chat_${Date.now()}.jpg`;
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/chat/image/pre-signed-url?imageName=${encodeURIComponent(imgName)}`;
        const reqBody = JSON.stringify({ imageName: imgName });
        console.log("getChatImageUploadUrl url:", url, "body:", reqBody);
        const response = await fetchWithRetry(url, { method: "POST", headers: proxyHeaders, body: reqBody });
        const text = await response.text();
        console.log("getChatImageUploadUrl response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "markOrderMessagesRead": {
        // POST /sapi/v1/c2c/chat/markOrderMessagesAsRead
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/chat/markOrderMessagesAsRead`;
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify({
          orderNo: payload.orderNo,
          userId: payload.userId,
        }) });
        const text = await response.text();
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      // Duplicate sendChatMessage case removed — handled above

      case "getChatGroupId": {
        // Try multiple approaches to get groupId
        const groupBody = JSON.stringify({
          orderNo: payload.orderNo,
          page: 1,
          rows: 10,
        });
        
        // Approach 1: Try proxy with BAPI path
        console.log("getChatGroupId: trying proxy /api/bapi/ path");
        let groupResponse = await fetch(`${BINANCE_PROXY_URL}/api/bapi/c2c/v1/private/chat/integrated-group-list`, { 
          method: "POST", headers: proxyHeaders, body: groupBody
        });
        let groupText = await groupResponse.text();
        
        if (groupResponse.status === 404 || groupText.includes("Not Found") || groupText.includes("<html")) {
          // Approach 2: Direct to p2p.binance.com with HMAC signing
          console.log("getChatGroupId: trying direct p2p.binance.com with HMAC");
          const timestamp = Date.now();
          const queryString = `timestamp=${timestamp}`;
          const encoder = new TextEncoder();
          const key = await crypto.subtle.importKey(
            "raw", encoder.encode(BINANCE_API_SECRET),
            { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
          );
          const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(queryString));
          const signature = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
          
          const hosts = ["p2p.binance.com", "www.binance.com"];
          for (const host of hosts) {
            const directUrl = `https://${host}/bapi/c2c/v1/private/chat/integrated-group-list?${queryString}&signature=${signature}`;
            console.log("getChatGroupId: trying direct", host);
            try {
              groupResponse = await fetch(directUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-MBX-APIKEY": BINANCE_API_KEY,
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                  "Origin": "https://www.binance.com",
                  "Referer": "https://www.binance.com/",
                  "clienttype": "web",
                },
                body: groupBody,
              });
              groupText = await groupResponse.text();
              console.log(`getChatGroupId ${host}:`, groupResponse.status, groupText.substring(0, 500));
              if (groupResponse.status === 200 && !groupText.includes("<html")) break;
            } catch (e) {
              console.log(`getChatGroupId ${host} error:`, (e as Error).message);
            }
          }
        } else {
          console.log("getChatGroupId proxy response:", groupResponse.status, groupText.substring(0, 500));
        }
        
        try { result = JSON.parse(groupText); } catch { result = { raw: groupText, status: groupResponse.status }; }
        break;
      }

      case "getRiskWarningTips": {
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/chat/getRiskWarningTips`;
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify({
          orderNo: payload.orderNo,
          fiat: payload.fiat,
          scene: payload.scene,
        }) });
        const text = await response.text();
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      // ==================== MERCHANT ====================
      case "merchantOnline": {
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/merchant/getOnline`;
        const response = await fetch(url, { method: "POST", headers: proxyHeaders });
        const text = await response.text();
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "merchantOffline": {
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/merchant/getOffline`;
        const response = await fetch(url, { method: "POST", headers: proxyHeaders });
        const text = await response.text();
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      // ==================== USER ====================
      case "getUserDetail": {
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/user/userDetail`;
        const response = await fetch(url, { method: "POST", headers: proxyHeaders });
        const text = await response.text();
        console.log("getUserDetail response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "confirmOrderVerified": {
        // POST /sapi/v1/c2c/orderMatch/verifiedAdditionalKyc (API doc #30)
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/verifiedAdditionalKyc`;
        const body = { orderNumber: payload.orderNumber };
        console.log("verifiedAdditionalKyc body:", JSON.stringify(body));
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(body) });
        const text = await response.text();
        console.log("verifiedAdditionalKyc response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Detect proxy/CDN errors (HTML responses, non-200 status in raw result)
    const isProxyError = result?.raw && (typeof result.raw === 'string' && (result.raw.includes('<!DOCTYPE') || result.raw.includes('<HTML')));
    const isStatusError = result?.status && result.status >= 400;
    const isBinanceError = result?.code && result.code !== "000000" && result.code !== 200;
    const isError = isProxyError || isStatusError || isBinanceError;

    const errorMessage = isProxyError 
      ? `Proxy returned HTTP ${result.status || 'error'} (CloudFront/WAF block)` 
      : isBinanceError 
        ? (result.message || result.msg || result.messageDetail || `Binance API error (code: ${result.code})`)
        : isStatusError
          ? `Proxy returned HTTP ${result.status}`
          : undefined;
    
    if (isError) {
      console.error("Binance API error - full result:", JSON.stringify(result));
    }

    return new Response(
      JSON.stringify({ 
        success: !isError, 
        data: isError ? null : result,
        ...(isError ? { error: errorMessage } : {})
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
