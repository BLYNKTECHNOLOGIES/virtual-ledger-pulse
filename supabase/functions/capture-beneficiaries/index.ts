import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ACTIVE_STATUSES = ["PENDING", "TRADING", "BUYER_PAYED", "DISTRIBUTING"];

interface PaymentInfo {
  accountNo: string;
  accountName: string;
  bankName: string;
  ifscCode: string;
  accountType: string;
  accountOpeningBranch: string;
  payType: string;
}

interface BeneficiaryRow {
  account_number: string;
  account_holder_name: string | null;
  ifsc_code: string | null;
  bank_name: string | null;
  account_type: string | null;
  account_opening_branch: string | null;
}

const clean = (value: unknown): string => String(value ?? "").trim();

const hasAccountNumber = (value: string): boolean => value.length >= 4;

const findFieldValue = (fields: any[], predicate: (field: any) => boolean): string => {
  const field = fields.find((f) => {
    const val = clean(f?.fieldValue);
    return val && predicate(f);
  });
  return clean(field?.fieldValue);
};

function extractPaymentFromMethods(methods: any[], detail: any): PaymentInfo | null {
  if (!Array.isArray(methods) || methods.length === 0) return null;

  const primary = methods[0] || {};
  const fields = Array.isArray(primary.fields) ? primary.fields : [];

  const accountNoFromFields = findFieldValue(fields, (f) => {
    const name = clean(f?.fieldName).toLowerCase();
    const contentType = clean(f?.fieldContentType).toLowerCase();
    return contentType === "pay_account" || /bank account|account\/?card|account number/.test(name);
  });

  const accountNameFromFields = findFieldValue(fields, (f) => {
    const name = clean(f?.fieldName).toLowerCase();
    const contentType = clean(f?.fieldContentType).toLowerCase();
    return contentType === "payee" || name === "name" || name.includes("account holder");
  });

  const ifscFromFields = findFieldValue(fields, (f) => clean(f?.fieldName).toLowerCase().includes("ifsc"));

  const bankFromFields = findFieldValue(fields, (f) => {
    const name = clean(f?.fieldName).toLowerCase();
    const contentType = clean(f?.fieldContentType).toLowerCase();
    return contentType === "bank" || name.includes("bank name");
  });

  const accountTypeFromFields = findFieldValue(fields, (f) =>
    clean(f?.fieldName).toLowerCase().includes("account type")
  );

  const openingBranchFromFields = findFieldValue(fields, (f) => {
    const name = clean(f?.fieldName).toLowerCase();
    return name.includes("opening branch") || name === "branch";
  });

  const accountNo = clean(
    primary.accountNo ||
      primary.account ||
      primary.bankAccount ||
      primary.bankAccountNumber ||
      accountNoFromFields
  );

  if (!hasAccountNumber(accountNo)) return null;

  return {
    accountNo,
    accountName: clean(
      primary.name || primary.accountName || primary.realName || primary.bankAccountName || accountNameFromFields
    ),
    bankName: clean(primary.bankName || primary.bank || primary.bankSubName || bankFromFields),
    ifscCode: clean(primary.ifscCode || primary.branchCode || primary.bankBranchCode || ifscFromFields),
    accountType: clean(primary.accountType || accountTypeFromFields),
    accountOpeningBranch: clean(primary.accountOpeningBranch || primary.branch || openingBranchFromFields),
    payType: clean(primary.payType || primary.tradeMethodName || primary.identifier || detail?.payType),
  };
}

/**
 * Extract seller payment details from Binance getUserOrderDetail response.
 */
function extractPaymentFromDetail(detail: any): PaymentInfo | null {
  const methodArrays = [
    detail?.tradeMethods,
    detail?.tradeMethodList,
    detail?.sellerPaymentMethodList,
    detail?.payMethods,
    detail?.payMethodList,
    detail?.sellerMethods,
  ].filter(Boolean);

  if (detail?.data) {
    methodArrays.push(
      detail.data.tradeMethods,
      detail.data.tradeMethodList,
      detail.data.sellerPaymentMethodList,
      detail.data.payMethods,
      detail.data.payMethodList,
      detail.data.sellerMethods,
    );
  }

  const methods = methodArrays.find((arr) => Array.isArray(arr) && arr.length > 0) || [];
  const fromMethods = extractPaymentFromMethods(methods, detail);
  if (fromMethods) return fromMethods;

  const fallbackAccountNo = clean(detail?.payAccountNo || detail?.payeeAccountNo || detail?.sellerAccountNo);
  if (!hasAccountNumber(fallbackAccountNo)) return null;

  return {
    accountNo: fallbackAccountNo,
    accountName: clean(detail?.payAccountName || detail?.payeeAccountName || detail?.sellerAccountName),
    bankName: clean(detail?.payBankName || detail?.bankName),
    ifscCode: clean(detail?.payIfscCode || detail?.ifscCode),
    accountType: clean(detail?.accountType || detail?.payAccountType),
    accountOpeningBranch: clean(
      detail?.accountOpeningBranch || detail?.openingBranch || detail?.branch
    ),
    payType: clean(detail?.payMethodName || detail?.payType),
  };
}

function extractPaymentFromStored(stored: any): PaymentInfo | null {
  if (!stored || typeof stored !== "object") return null;

  const directAccountNo = clean(
    stored.accountNo ||
      stored.account_number ||
      stored.payAccountNo ||
      stored.payeeAccountNo ||
      stored.sellerAccountNo
  );

  if (hasAccountNumber(directAccountNo)) {
    return {
      accountNo: directAccountNo,
      accountName: clean(
        stored.accountName ||
          stored.account_holder_name ||
          stored.payAccountName ||
          stored.payeeAccountName ||
          stored.sellerAccountName
      ),
      bankName: clean(stored.bankName || stored.bank_name || stored.payBankName),
      ifscCode: clean(stored.ifscCode || stored.ifsc_code || stored.payIfscCode),
      accountType: clean(stored.accountType || stored.account_type || stored.payAccountType),
      accountOpeningBranch: clean(
        stored.accountOpeningBranch || stored.account_opening_branch || stored.openingBranch || stored.branch
      ),
      payType: clean(stored.payType || stored.pay_type || stored.payMethodName),
    };
  }

  return extractPaymentFromDetail(stored._raw_detail || stored.raw_detail || stored);
}

function buildEnrichmentPatch(existing: BeneficiaryRow, incoming: PaymentInfo): Record<string, string> {
  const patch: Record<string, string> = {};

  if (!existing.account_holder_name && incoming.accountName) patch.account_holder_name = incoming.accountName;
  if (!existing.ifsc_code && incoming.ifscCode) patch.ifsc_code = incoming.ifscCode;
  if (!existing.bank_name && incoming.bankName) patch.bank_name = incoming.bankName;
  if (!existing.account_type && incoming.accountType) patch.account_type = incoming.accountType;
  if (!existing.account_opening_branch && incoming.accountOpeningBranch) {
    patch.account_opening_branch = incoming.accountOpeningBranch;
  }

  return patch;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const BINANCE_PROXY_URL = Deno.env.get("BINANCE_PROXY_URL");
  const BINANCE_API_KEY = Deno.env.get("BINANCE_API_KEY");
  const BINANCE_API_SECRET = Deno.env.get("BINANCE_API_SECRET");
  const BINANCE_PROXY_TOKEN = Deno.env.get("BINANCE_PROXY_TOKEN");

  if (!BINANCE_PROXY_URL || !BINANCE_API_KEY || !BINANCE_API_SECRET || !BINANCE_PROXY_TOKEN) {
    console.error("[CaptureBeneficiaries] Missing Binance secrets");
    return new Response(JSON.stringify({ error: "Missing Binance configuration" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const proxyHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "x-proxy-token": BINANCE_PROXY_TOKEN,
    "x-api-key": BINANCE_API_KEY,
    "x-api-secret": BINANCE_API_SECRET,
    clientType: "web",
  };

  let captured = 0;
  let checked = 0;
  let enriched = 0;

  try {
    // 1a. Active BUY orders
    const { data: activeOrders, error: activeErr } = await supabase
      .from("binance_order_history")
      .select("order_number, order_status, seller_payment_details, create_time")
      .eq("trade_type", "BUY")
      .in("order_status", ACTIVE_STATUSES)
      .order("create_time", { ascending: false })
      .limit(100);

    if (activeErr) {
      console.error("[CaptureBeneficiaries] Active order query error:", activeErr);
      return new Response(JSON.stringify({ error: activeErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1b. Recently completed BUY orders (safety window for race conditions)
    const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
    const { data: recentCompleted, error: completedErr } = await supabase
      .from("binance_order_history")
      .select("order_number, order_status, seller_payment_details, create_time")
      .eq("trade_type", "BUY")
      .eq("order_status", "COMPLETED")
      .gte("create_time", twelveHoursAgo)
      .order("create_time", { ascending: false })
      .limit(40);

    if (completedErr) {
      console.warn("[CaptureBeneficiaries] Completed order query warning:", completedErr);
    }

    const allOrdersRaw = [...(activeOrders || []), ...(recentCompleted || [])] as Array<{
      order_number: string;
      order_status: string;
      seller_payment_details: any;
    }>;

    const seenOrders = new Set<string>();
    const allOrders = allOrdersRaw.filter((o) => {
      if (!o?.order_number || seenOrders.has(o.order_number)) return false;
      seenOrders.add(o.order_number);
      return true;
    });

    if (allOrders.length === 0) {
      console.log("[CaptureBeneficiaries] No orders found in scope.");
      return new Response(
        JSON.stringify({ captured: 0, checked: 0, enriched: 0, duration_ms: Date.now() - startTime }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Resolve beneficiary records that already exist for stored account numbers
    const storedInfoMap = new Map<string, PaymentInfo | null>();
    const storedAccountNumbers = new Set<string>();

    for (const order of allOrders) {
      const info = extractPaymentFromStored(order.seller_payment_details);
      storedInfoMap.set(order.order_number, info);
      if (info?.accountNo) storedAccountNumbers.add(info.accountNo);
    }

    const beneficiaryMap = new Map<string, BeneficiaryRow>();
    if (storedAccountNumbers.size > 0) {
      const { data: existingBeneficiaries, error: benErr } = await supabase
        .from("beneficiary_records")
        .select("account_number, account_holder_name, ifsc_code, bank_name, account_type, account_opening_branch")
        .in("account_number", Array.from(storedAccountNumbers));

      if (benErr) {
        console.warn("[CaptureBeneficiaries] Existing beneficiary query warning:", benErr);
      } else {
        (existingBeneficiaries || []).forEach((row) => beneficiaryMap.set(row.account_number, row as BeneficiaryRow));
      }
    }

    // 3. Fast path: upsert from already stored order details if beneficiary doesn't exist yet
    for (const order of allOrders) {
      const storedInfo = storedInfoMap.get(order.order_number);
      if (!storedInfo?.accountNo) continue;
      if (beneficiaryMap.has(storedInfo.accountNo)) continue;

      checked++;
      const { error: rpcErr } = await supabase.rpc("upsert_beneficiary_record", {
        p_account_number: storedInfo.accountNo,
        p_account_holder_name: storedInfo.accountName || null,
        p_ifsc_code: storedInfo.ifscCode || null,
        p_bank_name: storedInfo.bankName || null,
        p_source_order_number: null,
        p_client_name: null,
        p_account_type: storedInfo.accountType || null,
        p_account_opening_branch: storedInfo.accountOpeningBranch || null,
      });

      if (rpcErr) {
        console.warn(`[CaptureBeneficiaries] Stored upsert failed for ${order.order_number}:`, rpcErr);
        continue;
      }

      beneficiaryMap.set(storedInfo.accountNo, {
        account_number: storedInfo.accountNo,
        account_holder_name: storedInfo.accountName || null,
        ifsc_code: storedInfo.ifscCode || null,
        bank_name: storedInfo.bankName || null,
        account_type: storedInfo.accountType || null,
        account_opening_branch: storedInfo.accountOpeningBranch || null,
      });

      captured++;
      console.log(`[CaptureBeneficiaries] ✓ Backfilled beneficiary from stored details for ${order.order_number}`);
    }

    // 4. Enrich existing beneficiaries with missing account type/branch/name/IFSC/bank from stored detail
    for (const order of allOrders) {
      const storedInfo = storedInfoMap.get(order.order_number);
      if (!storedInfo?.accountNo) continue;

      const existing = beneficiaryMap.get(storedInfo.accountNo);
      if (!existing) continue;

      const patch = buildEnrichmentPatch(existing, storedInfo);
      if (Object.keys(patch).length === 0) continue;

      const { error: updateErr } = await supabase
        .from("beneficiary_records")
        .update(patch)
        .eq("account_number", storedInfo.accountNo);

      if (updateErr) {
        console.warn(`[CaptureBeneficiaries] Enrichment update failed for ${storedInfo.accountNo}:`, updateErr);
        continue;
      }

      beneficiaryMap.set(storedInfo.accountNo, { ...existing, ...patch });
      enriched++;
    }

    // 5. Fetch live detail for orders that still have no usable stored account number
    const ordersNeedingFetch = allOrders.filter((order) => {
      const storedInfo = storedInfoMap.get(order.order_number);
      return !storedInfo?.accountNo;
    });

    if (ordersNeedingFetch.length === 0) {
      const duration = Date.now() - startTime;
      console.log(
        `[CaptureBeneficiaries] Complete (stored-only): captured=${captured}, checked=${checked}, enriched=${enriched}, duration=${duration}ms`
      );
      return new Response(
        JSON.stringify({ captured, checked, enriched, duration_ms: duration }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[CaptureBeneficiaries] Fetching Binance detail for ${ordersNeedingFetch.length} orders.`);

    for (const order of ordersNeedingFetch) {
      checked++;

      try {
        const detailUrl = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/getUserOrderDetail`;
        const detailResp = await fetch(detailUrl, {
          method: "POST",
          headers: proxyHeaders,
          body: JSON.stringify({ adOrderNo: order.order_number }),
        });

        const detailText = await detailResp.text();
        let detailJson: any;

        try {
          detailJson = JSON.parse(detailText);
        } catch {
          console.warn(`[CaptureBeneficiaries] Non-JSON response for ${order.order_number}`);
          continue;
        }

        const detail = detailJson?.data?.data || detailJson?.data || detailJson;
        if (!detail) {
          console.warn(`[CaptureBeneficiaries] Empty detail for ${order.order_number}`);
          continue;
        }

        const paymentInfo = extractPaymentFromDetail(detail);

        const paymentDetails: Record<string, any> = {
          ...(paymentInfo || {}),
          captured_at: new Date().toISOString(),
          captured_from_status: order.order_status,
          _detail_keys: Object.keys(detail),
          _raw_detail: detail,
        };

        const { error: updateErr } = await supabase
          .from("binance_order_history")
          .update({ seller_payment_details: paymentDetails })
          .eq("order_number", order.order_number);

        if (updateErr) {
          console.warn(`[CaptureBeneficiaries] DB update failed for ${order.order_number}:`, updateErr);
          continue;
        }

        if (paymentInfo?.accountNo) {
          const existing = beneficiaryMap.get(paymentInfo.accountNo);

          if (!existing) {
            const { error: rpcErr } = await supabase.rpc("upsert_beneficiary_record", {
              p_account_number: paymentInfo.accountNo,
              p_account_holder_name: paymentInfo.accountName || null,
              p_ifsc_code: paymentInfo.ifscCode || null,
              p_bank_name: paymentInfo.bankName || null,
              p_source_order_number: null,
              p_client_name: null,
              p_account_type: paymentInfo.accountType || null,
              p_account_opening_branch: paymentInfo.accountOpeningBranch || null,
            });

            if (rpcErr) {
              console.warn(`[CaptureBeneficiaries] Beneficiary upsert failed for ${order.order_number}:`, rpcErr);
            } else {
              beneficiaryMap.set(paymentInfo.accountNo, {
                account_number: paymentInfo.accountNo,
                account_holder_name: paymentInfo.accountName || null,
                ifsc_code: paymentInfo.ifscCode || null,
                bank_name: paymentInfo.bankName || null,
                account_type: paymentInfo.accountType || null,
                account_opening_branch: paymentInfo.accountOpeningBranch || null,
              });
              captured++;
            }
          } else {
            const patch = buildEnrichmentPatch(existing, paymentInfo);
            if (Object.keys(patch).length > 0) {
              const { error: benUpdateErr } = await supabase
                .from("beneficiary_records")
                .update(patch)
                .eq("account_number", paymentInfo.accountNo);

              if (benUpdateErr) {
                console.warn(
                  `[CaptureBeneficiaries] Beneficiary enrichment failed for ${paymentInfo.accountNo}:`,
                  benUpdateErr
                );
              } else {
                beneficiaryMap.set(paymentInfo.accountNo, { ...existing, ...patch });
                enriched++;
              }
            }
          }
        }

        console.log(
          `[CaptureBeneficiaries] ✓ Processed ${order.order_number}`,
          paymentInfo ? `account=${paymentInfo.accountNo}, bank=${paymentInfo.bankName || "-"}` : "no bank account"
        );
      } catch (err) {
        console.warn(`[CaptureBeneficiaries] Error processing ${order.order_number}:`, err);
      }

      await new Promise((r) => setTimeout(r, 400));
    }

    const duration = Date.now() - startTime;
    console.log(
      `[CaptureBeneficiaries] Complete: captured=${captured}, checked=${checked}, enriched=${enriched}, duration=${duration}ms`
    );

    return new Response(
      JSON.stringify({ captured, checked, enriched, duration_ms: duration }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[CaptureBeneficiaries] Fatal error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});