import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function maskIdentifier(value: unknown): string | null {
  const raw = typeof value === "string" || typeof value === "number" ? String(value) : "";
  if (!raw) return null;
  if (raw.length <= 4) return "****";
  return `${raw.slice(0, 2)}${"*".repeat(Math.max(4, raw.length - 4))}${raw.slice(-2)}`;
}

function unwrapOrderDetail(result: any) {
  return result?.data?.data || result?.data || result;
}

function normalizeUserRisk(user: any) {
  if (!user || typeof user !== "object") return null;
  return {
    historyStats: user.userOrderHistoryStatsVo || null,
    inProgressStats: user.userOrderInProgressStatsVo || null,
    kyc: user.userKycVo || null,
    rawUserKeys: Object.keys(user).slice(0, 50),
  };
}

function normalizeOrderRiskSnapshot(detail: any, tradeType?: string | null) {
  if (!detail || typeof detail !== "object") return null;
  const normalizedTradeType = String(tradeType || detail.tradeType || "").toUpperCase();
  const counterpartySide = normalizedTradeType === "BUY" ? "seller" : normalizedTradeType === "SELL" ? "buyer" : null;
  const explicitUser = counterpartySide ? (detail[counterpartySide] || detail[`${counterpartySide}Vo`] || detail[`${counterpartySide}User`]) : null;
  const fallbackUser = explicitUser || detail.counterparty || detail.counterpartyUser || detail.maker || detail.taker || null;
  const missingSections = [
    !fallbackUser ? "counterpartyRisk" : null,
    !(fallbackUser?.userKycVo || detail.maker?.userKycVo || detail.taker?.userKycVo) ? "kyc" : null,
    !(fallbackUser?.userOrderHistoryStatsVo || detail.maker?.userOrderHistoryStatsVo || detail.taker?.userOrderHistoryStatsVo) ? "historicalStats" : null,
  ].filter(Boolean);

  return {
    source: "getUserOrderDetail",
    sourceEndpoint: "/sapi/v1/c2c/orderMatch/getUserOrderDetail",
    capturedAt: new Date().toISOString(),
    tradeType: normalizedTradeType || null,
    counterpartySide,
    availableFields: Object.keys(detail),
    missingSections,
    topLevel: {
      maliceInitiatorCount: detail.maliceInitiatorCount ?? null,
      complaintCount: detail.complaintCount ?? null,
      overComplained: detail.overComplained ?? null,
      buyerCreditScore: detail.buyerCreditScore ?? null,
      sellerCreditScore: detail.sellerCreditScore ?? null,
      isRiskCount: detail.isRiskCount ?? null,
      idNumberMasked: maskIdentifier(detail.idNumber),
    },
    counterparty: normalizeUserRisk(fallbackUser),
    maker: normalizeUserRisk(detail.maker),
    taker: normalizeUserRisk(detail.taker),
  };
}

function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function binanceMsToIso(value: unknown): string | null {
  const ms = Number(value || 0);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

function extractMarkPaidData(result: any) {
  const data = result?.data?.data || result?.data || result;
  return data && typeof data === "object" ? data : {};
}

function getBusinessStatusLabel(status: unknown): string {
  const value = Number(status);
  if (value === 1) return "open";
  if (value === 2) return "closed";
  if (value === 3) return "take_break";
  return "unknown";
}

async function persistMerchantStateSnapshot(supabase: any, data: any, source = "baseDetail") {
  const businessStatus = Number(data?.businessStatus);
  if (!Number.isFinite(businessStatus)) return;
  const { error } = await supabase.from("binance_merchant_state_snapshots").insert({
    business_status: businessStatus,
    business_status_label: getBusinessStatusLabel(businessStatus),
    kyc_passed: typeof data.kycPassed === "boolean" ? data.kycPassed : null,
    user_kyc_status: data.userKycStatus || null,
    kyc_type: data.kycType == null ? null : Number(data.kycType),
    nickname: data.nickname || null,
    country_code: data.countryCode || null,
    register_days: data.registerDays == null ? null : Number(data.registerDays),
    bind_mobile_status: data.bindMobileStatus || null,
    over_complained: data.overComplained == null ? null : Number(data.overComplained),
    source,
    raw_data: data,
  });
  if (error) throw error;
}

async function fetchBaseDetail(proxyUrl: string, headers: Record<string, string>) {
  const endpoint = "/api/sapi/v1/c2c/user/baseDetail";
  const response = await fetch(`${proxyUrl}${endpoint}`, { method: "POST", headers });
  const text = await response.text();
  console.log("getUserDetail baseDetail response:", response.status, text.substring(0, 500));
  let result: any;
  try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
  result._diagnostics = { endpoint, method: "POST", httpStatus: response.status };
  const userData = result?.data?.data || result?.data;
  if (response.ok && result?.code === "000000" && (!userData || typeof userData !== "object" || Object.keys(userData).length === 0)) {
    result = { code: "EMPTY_BASE_DETAIL", message: "Binance baseDetail returned no usable user data.", _diagnostics: { endpoint, method: "POST", httpStatus: response.status } };
  }
  if (response.ok && result?.code === "000000" && userData && !Number.isFinite(Number(userData.businessStatus))) {
    result = { code: "MISSING_BUSINESS_STATUS", message: "Binance baseDetail returned user data without a usable businessStatus.", data: userData, _diagnostics: { endpoint, method: "POST", httpStatus: response.status } };
  }
  return { result, userData };
}

function buildCommissionRateSnapshots(detail: any, sourceType: string, sourceId: string) {
  if (!detail || typeof detail !== "object" || !sourceId) return [];
  const list = Array.isArray(detail.tradeMethodCommissionRateVoList) ? detail.tradeMethodCommissionRateVoList : [];
  const methods = Array.isArray(detail.tradeMethods) ? detail.tradeMethods : Array.isArray(detail.payMethods) ? detail.payMethods : [];
  const entries = list.length > 0 ? list : methods.length > 0 ? methods : [{}];
  const hasCommissionData = list.length > 0 || detail.commissionRate !== undefined || detail.takerCommissionRate !== undefined || detail.commission !== undefined || detail.takerCommission !== undefined;
  if (!hasCommissionData) return [];

  return entries.map((entry: any, index: number) => {
    const method = methods.find((m: any) =>
      String(m.identifier || m.payType || m.tradeMethodName || m.payId || "") === String(entry.tradeMethodIdentifier || entry.identifier || entry.payType || entry.tradeMethodName || entry.payId || "")
    ) || methods[index] || {};
    const effectiveRate = toNumeric(entry.commissionRate ?? detail.commissionRate ?? detail.takerCommissionRate);
    return {
      source_type: sourceType,
      source_id: sourceId,
      order_number: sourceType === "order_detail" || sourceType === "active_order_list" ? String(detail.orderNumber || detail.orderNo || detail.adOrderNo || sourceId) : null,
      adv_no: String(detail.advNo || detail.adsNo || (sourceType === "ad_detail" ? sourceId : "")) || null,
      trade_type: detail.tradeType || null,
      asset: detail.asset || "USDT",
      fiat_unit: detail.fiatUnit || detail.fiat || "INR",
      pay_method_identifier: entry.tradeMethodIdentifier || entry.identifier || method.identifier || method.payType || detail.payType || null,
      pay_method_name: entry.tradeMethodName || method.tradeMethodName || method.payType || detail.payMethodName || detail.payType || null,
      pay_id: entry.payId !== undefined ? String(entry.payId) : method.payId !== undefined ? String(method.payId) : detail.selectedPayId !== undefined ? String(detail.selectedPayId) : null,
      maker_commission_rate: toNumeric(detail.commissionRate),
      taker_commission_rate: toNumeric(detail.takerCommissionRate),
      effective_commission_rate: effectiveRate,
      actual_commission_amount: toNumeric(detail.commission ?? detail.takerCommission),
      commission_asset: detail.commissionAsset || detail.asset || "USDT",
      total_price: toNumeric(detail.totalPrice),
      amount: toNumeric(detail.amount ?? detail.takerAmount),
      raw_snapshot: { sourceType, sourceId, entry, commissionRate: detail.commissionRate ?? null, takerCommissionRate: detail.takerCommissionRate ?? null, commission: detail.commission ?? null, takerCommission: detail.takerCommission ?? null },
      captured_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });
}

async function persistCommissionRateSnapshots(supabase: any, detail: any, sourceType: string, sourceId: string) {
  const snapshots = buildCommissionRateSnapshots(detail, sourceType, sourceId);
  if (snapshots.length === 0) return;
  const { error: deleteErr } = await supabase
    .from("binance_commission_rate_snapshots")
    .delete()
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);
  if (deleteErr) throw deleteErr;
  const { error: insertErr } = await supabase.from("binance_commission_rate_snapshots").insert(snapshots);
  if (insertErr) throw insertErr;
}

function extractChatMessages(result: any): any[] {
  const outer = result?.data ?? result;
  const inner = outer?.data ?? outer;
  if (Array.isArray(inner)) return inner;
  if (Array.isArray(inner?.list)) return inner.list;
  if (Array.isArray(inner?.messages)) return inner.messages;
  if (Array.isArray(outer?.list)) return outer.list;
  return [];
}

function normalizeChatMessage(orderNo: string, msg: any) {
  const rawType = String(msg?.type || msg?.chatMessageType || msg?.messageType || "unknown").toLowerCase();
  const messageType = rawType || "unknown";
  const content = msg?.content ?? msg?.message ?? msg?.text ?? null;
  const createTime = Number(msg?.createTime || msg?.time || 0);
  const isSystem = messageType === "system" || msg?.self === undefined && /system|notice|risk|warning|kyc|appeal|complaint/i.test(String(content || ""));
  const isRecall = messageType === "recall" || /recall|retract|withdraw/i.test(messageType);
  const isComplianceRelevant = isSystem || isRecall || ["card", "video", "error", "mark"].includes(messageType);
  const binanceMessageId = msg?.id == null ? null : String(msg.id);
  const binanceUuid = msg?.uuid == null ? null : String(msg.uuid);

  return {
    order_number: orderNo,
    binance_message_id: binanceMessageId || binanceUuid || `${orderNo}-${createTime}-${messageType}-${String(content || "").slice(0, 80)}`,
    binance_uuid: binanceUuid,
    message_type: messageType,
    chat_message_type: msg?.chatMessageType == null ? null : String(msg.chatMessageType),
    sender_is_self: typeof msg?.self === "boolean" ? msg.self : typeof msg?.isSelf === "boolean" ? msg.isSelf : null,
    sender_nickname: msg?.fromNickName || msg?.senderNickName || msg?.nickName || null,
    message_status: msg?.status == null ? msg?.sendStatus == null ? null : String(msg.sendStatus) : String(msg.status),
    binance_create_time: Number.isFinite(createTime) && createTime > 0 ? createTime : null,
    binance_created_at: Number.isFinite(createTime) && createTime > 0 ? new Date(createTime).toISOString() : null,
    message_text: typeof content === "string" ? content : content == null ? null : JSON.stringify(content),
    image_url: msg?.imageUrl || null,
    thumbnail_url: msg?.thumbnailUrl || null,
    raw_payload: msg,
    is_system_message: isSystem,
    is_recall: isRecall,
    is_compliance_relevant: isComplianceRelevant,
    captured_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function persistChatMessages(supabase: any, orderNo: string, messages: any[]) {
  let inserted = 0;
  let updated = 0;
  let systemMessages = 0;
  let recalls = 0;
  let errors = 0;

  for (const msg of messages) {
    const row = normalizeChatMessage(orderNo, msg);
    if (row.is_system_message) systemMessages++;
    if (row.is_recall) recalls++;
    if (row.message_type === "error") errors++;

    const { data: existing, error: readErr } = await supabase
      .from("binance_order_chat_messages")
      .select("id")
      .eq("order_number", orderNo)
      .eq("binance_message_id", row.binance_message_id)
      .maybeSingle();
    if (readErr) throw readErr;

    if (existing?.id) {
      const { error } = await supabase.from("binance_order_chat_messages").update(row).eq("id", existing.id);
      if (error) throw error;
      updated++;
    } else {
      const { error } = await supabase.from("binance_order_chat_messages").insert(row);
      if (error) throw error;
      inserted++;
    }
  }

  return { fetched: messages.length, inserted, updated, systemMessages, recalls, errors };
}

// Retry wrapper for transient network errors (connection closed, timeouts)
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2,
  delayMs = 500,
  timeoutMs = 15000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err as Error;

      if ((err as Error).name === "AbortError") {
        throw new Error(`Request timed out after ${timeoutMs}ms`);
      }

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

  // Helper: try multiple paths for visibility toggle
  async function setAdvVisibility(proxyUrl: string, headers: Record<string, string>, advNos: string[], visible: number): Promise<any> {
    const body = { advNos, visible };
    const paths = [
      `/api/sapi/v1/c2c/ads/setUserAdvVisible`,
      `/api/sapi/v1/c2c/ads/setVisible`,
      `/api/sapi/v1/c2c/ads/updateVisible`,
      `/api/bapi/c2c/v1/private/ads/setUserAdvVisible`,
      `/api/bapi/c2c/v1/private/ads/setVisible`,
    ];
    for (const path of paths) {
      const url = `${proxyUrl}${path}`;
      console.log("setAdvVisibility trying:", url, JSON.stringify(body));
      try {
        const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
        const text = await resp.text();
        console.log("setAdvVisibility response:", resp.status, text.substring(0, 500));
        let parsed: any;
        try { parsed = JSON.parse(text); } catch { parsed = { raw: text, status: resp.status }; }
        if (parsed?.code === "000000") {
          console.log("setAdvVisibility: working path found:", path);
          return parsed;
        }
        if (resp.status === 404 || text.includes('"Not Found"')) continue;
        // Non-404 response, might be the right endpoint but with an error
        return parsed;
      } catch (err) {
        console.warn("setAdvVisibility error on", path, (err as Error).message);
      }
    }
    return { code: "VISIBILITY_NOT_SUPPORTED", message: "No working visibility endpoint found on proxy" };
  }

  try {
    const BINANCE_PROXY_URL = Deno.env.get("BINANCE_PROXY_URL");
    const BINANCE_API_KEY = Deno.env.get("BINANCE_API_KEY");
    const BINANCE_API_SECRET = Deno.env.get("BINANCE_API_SECRET");
    const BINANCE_PROXY_TOKEN = Deno.env.get("BINANCE_PROXY_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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
                  const detailData = detail?.data?.data || detail?.data || detail;
                  const vis = detailData?.advVisibleRet;
                  if (vis && vis.userSetVisible === 1) {
                    ad.advStatus = 2; // Mark as Private
                    ad._isPrivate = true;
                  }
                  ad.advVisibleRet = vis || null;
                  ad.commissionRate = detailData?.commissionRate ?? ad.commissionRate;
                  ad.takerCommissionRate = detailData?.takerCommissionRate ?? ad.takerCommissionRate;
                  ad.tradeMethodCommissionRateVoList = detailData?.tradeMethodCommissionRateVoList || ad.tradeMethodCommissionRateVoList;
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
        const detail = result?.data?.data || result?.data || result;
        if (payload.adsNo && detail && !detail.error && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
          try {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            await persistCommissionRateSnapshots(supabase, detail, "ad_detail", String(payload.adsNo));
          } catch (persistErr) {
            console.warn("getAdDetail commission snapshot persist failed:", persistErr);
          }
        }
        break;
      }

      case "postAd": {
        const adData = { ...payload.adData };
        const wantPrivate = adData.advStatus === 2;
        // Binance only accepts advStatus 1 (online) or 3 (offline) for ad creation.
        // Our custom status 2 (Private) must be mapped to 1 for the API call.
        if (wantPrivate) {
          adData.advStatus = 1;
        }
        console.log("postAd request body:", JSON.stringify(adData).substring(0, 1000));
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/ads/post`;
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(adData) });
        const text = await response.text();
        console.log("postAd response:", response.status, text);
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }

        // If ad was created successfully and user wanted Private, toggle visibility
        if (wantPrivate && result?.code === "000000" && result?.data?.advNo) {
          const advNo = result.data.advNo;
          console.log(`postAd: Setting ad ${advNo} to Private via visibility helper...`);
          const visResult = await setAdvVisibility(BINANCE_PROXY_URL, proxyHeaders, [String(advNo)], 1);
          console.log("postAd visibility result:", JSON.stringify(visResult).substring(0, 500));
        }
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
        const advNosList = Array.isArray(payload.advNos) ? payload.advNos : [payload.advNos];
        const targetStatus = Number(payload.advStatus);

        if (targetStatus === 2) {
          // "Private" = Binance online (1) + userSetVisible=1
          // First ensure the ad is online, then toggle visibility
          const statusUrl = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/ads/updateStatus`;
          const statusBody = { advNos: advNosList.map(String), advStatus: 1 };
          console.log("updateAdStatus (to Private): first set online:", JSON.stringify(statusBody));
          const statusResp = await fetch(statusUrl, { method: "POST", headers: proxyHeaders, body: JSON.stringify(statusBody) });
          const statusText = await statusResp.text();
          console.log("updateAdStatus online response:", statusResp.status, statusText.substring(0, 500));

          // Now toggle visibility to Private
          const visResult = await setAdvVisibility(BINANCE_PROXY_URL, proxyHeaders, advNosList.map(String), 1);
          result = visResult;
        } else {
          // For status 1 (online) or 3 (offline), use normal updateStatus
          // If coming FROM private, first remove visibility restriction
          if (payload.fromPrivate) {
            const visResult = await setAdvVisibility(BINANCE_PROXY_URL, proxyHeaders, advNosList.map(String), 0);
            console.log("Remove private visibility result:", JSON.stringify(visResult).substring(0, 500));
          }

          const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/ads/updateStatus`;
          const body = { advNos: advNosList.map(String), advStatus: targetStatus };
          console.log("updateAdStatus request body:", JSON.stringify(body));
          const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify(body) });
          const text = await response.text();
          console.log("updateAdStatus response:", response.status, text.substring(0, 500));
          try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        }
        break;
      }

      case "setUserAdvVisible": {
        const advNosList = Array.isArray(payload.advNos) ? payload.advNos : [payload.advNos];
        result = await setAdvVisibility(BINANCE_PROXY_URL, proxyHeaders, advNosList.map(String), Number(payload.visible));
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
        if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
          try {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            const orders = Array.isArray(result?.data?.data) ? result.data.data : Array.isArray(result?.data) ? result.data : [];
            for (const order of orders) {
              const orderNo = String(order?.orderNumber || order?.orderNo || "");
              if (orderNo) await persistCommissionRateSnapshots(supabase, order, "active_order_list", orderNo);
            }
          } catch (persistErr) {
            console.warn("listActiveOrders commission snapshot persist failed:", persistErr);
          }
        }
        break;
      }

      case "getOrderDetail": {
        // POST /sapi/v1/c2c/orderMatch/getUserOrderDetail
        // Proxy supports adOrderNo in current production; include orderNo as a safe alias.
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/getUserOrderDetail`;
        const response = await fetchWithRetry(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify({
          adOrderNo: payload.orderNumber,
          orderNo: payload.orderNumber,
        }) });
        const text = await response.text();
        console.log("getOrderDetail response:", response.status, text.substring(0, 5000));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        const detail = unwrapOrderDetail(result);
        if (payload.orderNumber && detail && !detail.error && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
          try {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            const { data: existing } = await supabase
              .from("binance_order_history")
              .select("trade_type")
              .eq("order_number", String(payload.orderNumber))
              .maybeSingle();
            if (existing) {
              await supabase
                .from("binance_order_history")
                .update({
                  order_detail_raw: detail,
                  counterparty_risk_snapshot: normalizeOrderRiskSnapshot(detail, existing.trade_type),
                  counterparty_risk_captured_at: new Date().toISOString(),
                })
                .eq("order_number", String(payload.orderNumber));
              await persistCommissionRateSnapshots(supabase, detail, "order_detail", String(payload.orderNumber));
            }
          } catch (persistErr) {
            console.warn("getOrderDetail risk snapshot persist failed:", persistErr);
          }
        }
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
        const markPaidData = extractMarkPaidData(result);
        if (payload.orderNumber && (result?.code === "000000" || result?.success === true) && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
          try {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            await supabase.from("p2p_auto_pay_log").insert({
              order_number: String(payload.orderNumber),
              action: "manual_mark_paid",
              status: "success",
              decision_reason: "manual_mark_paid",
              raw_status: markPaidData?.orderStatus == null ? null : String(markPaidData.orderStatus),
              source: "binance_ads_manual",
              metadata: { markPaidResult: result, payId: payload.payId ?? null },
              notify_pay_time: binanceMsToIso(markPaidData?.notifyPayTime),
              confirm_pay_end_time: binanceMsToIso(markPaidData?.confirmPayEndTime),
              complain_freeze_time: binanceMsToIso(markPaidData?.complainFreezeTime),
              mark_paid_order_status: markPaidData?.orderStatus == null ? null : String(markPaidData.orderStatus),
            });
          } catch (persistErr) {
            console.warn("markOrderAsPaid response timestamp persist failed:", persistErr);
          }
        }
        break;
      }

      case "releaseCoin": {
        // POST /sapi/v1/c2c/orderMatch/releaseCoin (API doc #29)
        // IMPORTANT: OTP codes (especially YubiKey/FIDO2) are one-time; never retry with alternate payloads.
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/releaseCoin`;

        const normalizedAuthType = payload.authType === "YUBIKEY" ? "FIDO2" : payload.authType;
        const isYubiFlow = normalizedAuthType === "FIDO2" || !!payload.yubikeyVerifyCode;

        const body: Record<string, any> = {
          orderNumber: payload.orderNumber,
        };
        if (normalizedAuthType) body.authType = normalizedAuthType;

        // Critical: Binance releaseCoin rejects YubiKey flow when generic `code` is sent.
        // Keep `code` only for non-FIDO2 auth methods.
        if (!isYubiFlow && payload.code) body.code = payload.code;

        if (payload.googleVerifyCode) body.googleVerifyCode = payload.googleVerifyCode;
        if (payload.emailVerifyCode) body.emailVerifyCode = payload.emailVerifyCode;
        if (payload.mobileVerifyCode) body.mobileVerifyCode = payload.mobileVerifyCode;
        if (payload.yubikeyVerifyCode) body.yubikeyVerifyCode = payload.yubikeyVerifyCode;
        if (payload.payId !== undefined) body.payId = payload.payId;
        if (payload.confirmPaidType) body.confirmPaidType = payload.confirmPaidType;

        console.log("releaseCoin body:", JSON.stringify(body));

        // One-time verification codes must not be retried on network failures;
        // retries can burn the OTP and lead to false "verification failed" errors.
        const startedAt = Date.now();
        const response = await fetchWithRetry(url, {
          method: "POST",
          headers: proxyHeaders,
          body: JSON.stringify(body),
        }, 0, 500, 12000);
        const text = await response.text();
        console.log("releaseCoin response:", response.status, `in ${Date.now() - startedAt}ms`, text.substring(0, 1000));

        try {
          result = JSON.parse(text);
        } catch {
          result = { raw: text, status: response.status };
        }
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
        if (payload.sort) {
          chatParams.set('sort', payload.sort);
        }
        if (payload.id) chatParams.set('id', String(payload.id));
        if (payload.chatMessageType) chatParams.set('chatMessageType', String(payload.chatMessageType));
        const chatUrl = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/chat/retrieveChatMessagesWithPagination?${chatParams.toString()}`;
        console.log("getChatMessages URL (GET):", chatUrl);
        const response = await fetchWithRetry(chatUrl, {
          method: "GET",
          headers: proxyHeaders,
        });
        const text = await response.text();
        console.log("getChatMessages response:", response.status, text.substring(0, 800));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        const messages = extractChatMessages(result);
        if (payload.orderNo && messages.length > 0 && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
          try {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            const archive = await persistChatMessages(supabase, String(payload.orderNo), messages);
            result._archive = archive;
          } catch (persistErr) {
            console.warn("getChatMessages archive persist failed:", persistErr);
          }
        }
        break;
      }

      case "syncOrderChatMessages": {
        const orderNo = String(payload.orderNo || "");
        if (!orderNo) throw new Error("orderNo is required");
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase service configuration");

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const maxPages = Math.min(Number(payload.maxPages || 5), 20);
        const rows = Math.min(Number(payload.rows || 50), 100);
        let page = 1;
        const allMessages: any[] = [];

        while (page <= maxPages) {
          const chatParams = new URLSearchParams({ orderNo, page: String(page), rows: String(rows), sort: String(payload.sort || "asc") });
          if (payload.id) chatParams.set("id", String(payload.id));
          if (payload.chatMessageType) chatParams.set("chatMessageType", String(payload.chatMessageType));
          const chatUrl = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/chat/retrieveChatMessagesWithPagination?${chatParams.toString()}`;
          const response = await fetchWithRetry(chatUrl, { method: "GET", headers: proxyHeaders });
          const text = await response.text();
          let pageResult: any;
          try { pageResult = JSON.parse(text); } catch { pageResult = { raw: text, status: response.status }; }
          const pageMessages = extractChatMessages(pageResult);
          allMessages.push(...pageMessages);
          if (pageMessages.length < rows) break;
          page++;
        }

        const seen = new Set<string>();
        const deduped = allMessages.filter((msg) => {
          const key = String(msg?.id || msg?.uuid || `${msg?.createTime}-${msg?.type}-${msg?.content || msg?.message || ""}`);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const archive = await persistChatMessages(supabase, orderNo, deduped);
        result = { code: "000000", message: "success", data: archive };
        break;
      }

      case "sendChatMessage": {
        // Binance P2P chat requires WebSocket for sending messages — no REST endpoint exists.
        // Try proxy first, then fall back to WebSocket.
        const msgContent = payload.imageUrl || payload.content || payload.message;
        const msgType = payload.imageUrl ? "IMAGE" : (payload.contentType || payload.chatMessageType || "TEXT");
        
        // Try proxy first
        const sendMsgUrl = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/chat/sendMessage?orderNo=${encodeURIComponent(payload.orderNo)}&content=${encodeURIComponent(msgContent)}&contentType=${encodeURIComponent(msgType)}`;
        console.log("sendChatMessage trying proxy:", sendMsgUrl);
        let response = await fetchWithRetry(sendMsgUrl, { method: "POST", headers: proxyHeaders });
        let text = await response.text();
        console.log("sendChatMessage proxy response:", response.status, text.substring(0, 500));

        // If proxy 404, use WebSocket approach
        if (response.status === 404 || text.includes("Not Found")) {
          console.log("sendChatMessage: proxy 404, using WebSocket approach");
          
          // Step 1: Get chat credentials
          const timestamp = Date.now();
          const credQs = `timestamp=${timestamp}`;
          const encoder = new TextEncoder();
          const credKey = await crypto.subtle.importKey(
            "raw", encoder.encode(BINANCE_API_SECRET),
            { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
          );
          const credSig = await crypto.subtle.sign("HMAC", credKey, encoder.encode(credQs));
          const credSignature = Array.from(new Uint8Array(credSig)).map(b => b.toString(16).padStart(2, '0')).join('');
          
          const credUrl = `https://api.binance.com/sapi/v1/c2c/chat/retrieveChatCredential?${credQs}&signature=${credSignature}`;
          const credRes = await fetch(credUrl, {
            method: "GET",
            headers: { "X-MBX-APIKEY": BINANCE_API_KEY, "Content-Type": "application/json" },
          });
          const credText = await credRes.text();
          console.log("getChatCredential:", credRes.status, credText.substring(0, 500));
          
          let credData: any;
          try { credData = JSON.parse(credText); } catch { credData = null; }
          
          if (credData?.code === "000000" && credData?.data) {
            const { chatWssUrl, listenKey, listenToken } = credData.data;
            const token = listenToken || credData.data.token;
            const wssUrl = `${chatWssUrl}/${listenKey}?token=${token}&clientType=web`;
            
            // Step 2: Connect and send via WebSocket
            console.log(`WS connecting for sendChatMessage order ${payload.orderNo}...`);
            const wsResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
              const wsTimeout = setTimeout(() => {
                try { ws.close(); } catch {}
                resolve({ success: false, error: "WebSocket timeout (8s)" });
              }, 8000);

              const ws = new WebSocket(wssUrl);
              ws.onopen = () => {
                console.log(`WS open, sending to order ${payload.orderNo}`);
                const msgPayload = JSON.stringify({
                  type: "chat",
                  data: JSON.stringify({
                    type: "text",
                    orderNo: payload.orderNo,
                    content: msgContent,
                    contentType: msgType,
                    self: true,
                    uuid: crypto.randomUUID(),
                  }),
                });
                ws.send(msgPayload);
                setTimeout(() => {
                  clearTimeout(wsTimeout);
                  try { ws.close(); } catch {}
                  resolve({ success: true });
                }, 1500);
              };
              ws.onerror = (err) => {
                clearTimeout(wsTimeout);
                console.error(`WS error for ${payload.orderNo}:`, err);
                resolve({ success: false, error: "WebSocket error" });
              };
            });

            if (wsResult.success) {
              result = { code: "000000", success: true, message: "Sent via WebSocket" };
            } else {
              result = { code: "ERROR", success: false, error: wsResult.error };
            }
          } else {
            result = { code: "ERROR", success: false, error: "Failed to get chat credentials", raw: credText.substring(0, 300) };
          }
        } else {
          try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        }
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
        const fetched = await fetchBaseDetail(BINANCE_PROXY_URL, proxyHeaders);
        result = fetched.result;
        if (result?.code === "000000" && fetched.userData && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
          try {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            await persistMerchantStateSnapshot(supabase, fetched.userData, "baseDetail");
          } catch (persistErr) {
            console.warn("merchant state snapshot persist failed:", persistErr);
          }
        }
        break;
      }

      case "refreshMerchantState": {
        const fetched = await fetchBaseDetail(BINANCE_PROXY_URL, proxyHeaders);
        result = fetched.result;
        if (result?.code === "000000" && fetched.userData && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
          try {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            await persistMerchantStateSnapshot(supabase, fetched.userData, "baseDetail_refresh");
            result.normalized = {
              businessStatus: Number(fetched.userData.businessStatus),
              businessStatusLabel: getBusinessStatusLabel(fetched.userData.businessStatus),
              checkedAt: new Date().toISOString(),
            };
          } catch (persistErr) {
            console.warn("merchant state refresh persist failed:", persistErr);
          }
        }
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

      case "getDigitalCurrencyList": {
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/digitalCurrency/list`;
        console.log("getDigitalCurrencyList URL:", url);
        const response = await fetch(url, { method: "POST", headers: proxyHeaders, body: JSON.stringify({}) });
        const text = await response.text();
        console.log("getDigitalCurrencyList response:", response.status, text.substring(0, 500));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "getAvailableAdsCategory": {
        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/ads/getAvailableAdsCategory`;
        console.log("getAvailableAdsCategory URL:", url);
        const response = await fetch(url, { method: "GET", headers: proxyHeaders });
        const text = await response.text();
        console.log("getAvailableAdsCategory response:", response.status, text.substring(0, 1000));
        try { result = JSON.parse(text); } catch { result = { raw: text, status: response.status }; }
        break;
      }

      case "searchP2PMerchant": {
        // Public Binance P2P search — no proxy auth needed
        // Fetch up to 500 listings (25 pages of 20) to find merchants placed lower
        // The raw API includes many small/unverified accounts the Binance website filters out
        const binanceTradeType = payload.tradeType === "BUY" ? "SELL" : "BUY";
        const allItems: any[] = [];
        for (let pg = 1; pg <= 25; pg++) {
          const searchResp = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              asset: payload.asset || "USDT",
              fiat: payload.fiat || "INR",
              tradeType: binanceTradeType,
              page: pg,
              rows: 20,
              publisherType: "merchant",
              payTypes: [],
            }),
          });
          const pgData = await searchResp.json();
          const items = pgData?.data || [];
          allItems.push(...items);
          if (items.length < 20) break;
        }
        const allMerchants = allItems.map((item: any) => ({
          nickName: item.advertiser?.nickName,
          price: item.adv?.price,
          surplusAmount: item.adv?.surplusAmount,
          tradeType: item.adv?.tradeType,
          asset: item.adv?.asset,
          completionRate: item.advertiser?.monthFinishRate,
          orderCount: item.advertiser?.monthOrderCount,
          userType: item.advertiser?.userType,
          isOnline: item.advertiser?.isOnline,
        }));

        if (payload.nickname) {
          const target = allMerchants.find((m: any) =>
            m.nickName?.toLowerCase() === payload.nickname.toLowerCase()
          );
          result = { merchants: allMerchants, target: target || null };
        } else {
          result = { merchants: allMerchants };
        }
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

    const yubiFlow = action === "releaseCoin" && ((payload?.authType === "FIDO2") || (payload?.authType === "YUBIKEY") || !!payload?.yubikeyVerifyCode);

    const errorMessage = isProxyError 
      ? `Proxy returned HTTP ${result.status || 'error'} (CloudFront/WAF block)` 
      : isBinanceError
        ? (
            yubiFlow && /verification failed/i.test(String(result.message || result.msg || ""))
              ? "YubiKey verification failed. The OTP is invalid, expired, or already used. Tap your registered YubiKey and use a fresh one-time code."
              : yubiFlow && /unsupported authentication type/i.test(String(result.message || result.msg || ""))
                ? "YubiKey authentication mode is not accepted for this release request."
                : (result.message || result.msg || result.messageDetail || `Binance API error (code: ${result.code})`)
          )
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
