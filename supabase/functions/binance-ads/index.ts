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
        // POST relay: proxy converts POST body → signed GET for Binance
        const ohBody: Record<string, any> = {
          page: payload.page || 1,
          rows: payload.rows || 100,
        };
        if (payload.tradeType) ohBody.tradeType = payload.tradeType;
        if (payload.startTimestamp) ohBody.startTimestamp = payload.startTimestamp;
        if (payload.endTimestamp) ohBody.endTimestamp = payload.endTimestamp;

        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/listUserOrderHistory`;
        console.log("getOrderHistory URL (POST relay):", url, JSON.stringify(ohBody));
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(ohBody) });
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
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/getUserOrderDetail`;
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify({
          adOrderNo: payload.orderNumber,
        }) });
        const text = await response.text();
        console.log("getOrderDetail response:", response.status, text.substring(0, 1500));
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
        // POST /sapi/v1/c2c/orderMatch/releaseCoin
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/releaseCoin`;
        const body: Record<string, any> = {
          orderNumber: payload.orderNumber,
        };
        if (payload.authType) body.authType = payload.authType;
        if (payload.code) body.code = payload.code;
        if (payload.emailVerifyCode) body.emailVerifyCode = payload.emailVerifyCode;
        if (payload.googleVerifyCode) body.googleVerifyCode = payload.googleVerifyCode;
        if (payload.mobileVerifyCode) body.mobileVerifyCode = payload.mobileVerifyCode;
        console.log("releaseCoin body:", JSON.stringify(body));
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(body) });
        const text = await response.text();
        console.log("releaseCoin response:", response.status, text.substring(0, 500));
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
        // POST relay — proxy reads body, adds timestamp/signature, forwards as GET to Binance
        const chatBody = {
          orderNo: payload.orderNo,
          page: String(payload.page || 1),
          rows: String(payload.rows || 50),
        };
        const chatUrl = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/chat/retrieveChatMessagesWithPagination`;
        console.log("getChatMessages URL (POST relay):", chatUrl, JSON.stringify(chatBody));
        const response = await fetch(chatUrl, {
          method: "POST",
          headers: { ...proxyHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(chatBody),
        });
        const text = await response.text();
        console.log("getChatMessages response:", response.status, text.substring(0, 800));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "getChatCredential": {
        // GET /sapi/v1/c2c/chat/retrieveChatCredential
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/chat/retrieveChatCredential`;
        const response = await fetch(url, { method: "GET", headers: proxyHeaders });
        const text = await response.text();
        console.log("getChatCredential response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "getChatImageUploadUrl": {
        // POST /sapi/v1/c2c/chat/image/pre-signed-url
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/chat/image/pre-signed-url`;
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify({
          imageName: payload.imageName,
        }) });
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

      case "sendChatMessage": {
        // POST relay for sending chat messages
        const sendChatBody = {
          orderNo: payload.orderNo,
          message: payload.message,
          chatMessageType: payload.chatMessageType || "text",
        };
        const sendChatUrl = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/chat/sendChatMessage`;
        console.log("sendChatMessage URL (POST relay):", sendChatUrl, JSON.stringify(sendChatBody));
        const response = await fetch(sendChatUrl, {
          method: "POST",
          headers: { ...proxyHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(sendChatBody),
        });
        const text = await response.text();
        console.log("sendChatMessage response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
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
        // POST /sapi/v1/c2c/orderMatch/confirmOrderVerified
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/confirmOrderVerified`;
        const body = { orderNumber: payload.orderNumber };
        console.log("confirmOrderVerified body:", JSON.stringify(body));
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(body) });
        const text = await response.text();
        console.log("confirmOrderVerified response:", response.status, text.substring(0, 500));
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
        ? (result.message || "Binance API error")
        : isStatusError
          ? `Proxy returned HTTP ${result.status}`
          : undefined;

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
