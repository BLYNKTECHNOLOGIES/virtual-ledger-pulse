import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { scope = ["all"], triggered_by = "system" } = await req.json().catch(() => ({}));

    // Check if AI reconciliation is enabled
    const { data: setting } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "ai_reconciliation_enabled")
      .single();

    if (setting?.setting_value !== "true") {
      return new Response(JSON.stringify({ error: "AI Reconciliation is disabled" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create scan log entry
    const { data: scanLog, error: scanErr } = await supabase
      .from("reconciliation_scan_log")
      .insert({ triggered_by, scan_scope: scope, status: "running" })
      .select("id")
      .single();

    if (scanErr || !scanLog) throw new Error("Failed to create scan log: " + scanErr?.message);
    const scanId = scanLog.id;
    const startTime = Date.now();

    const findings: any[] = [];
    const scopeAll = scope.includes("all");

    // Calculate today's IST (UTC+5:30) start as epoch milliseconds
    // This ensures we only scan orders from today's calendar day in IST
    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);
    const istMidnight = new Date(istNow.getFullYear(), istNow.getMonth(), istNow.getDate(), 0, 0, 0, 0);
    const todayStartEpochMs = istMidnight.getTime() - istOffsetMs; // Convert IST midnight back to UTC epoch

    // ============================================================
    // MODULE 1: Missing Purchase Entries (BUY orders not in ERP)
    // ============================================================
    if (scopeAll || scope.includes("orders")) {
      try {
        const { data: buyOrders } = await supabase
          .from("binance_order_history")
          .select("order_number, asset, total_price, amount, unit_price, commission, counter_part_nick_name, create_time, pay_method_name")
          .eq("trade_type", "BUY")
          .eq("order_status", "COMPLETED")
          .gte("create_time", todayStartEpochMs);

        if (buyOrders?.length) {
          const orderNums = buyOrders.map(o => o.order_number);
          const { data: syncedPurchases } = await supabase
            .from("terminal_purchase_sync")
            .select("binance_order_number")
            .in("binance_order_number", orderNums);

          const syncedSet = new Set((syncedPurchases || []).map(s => s.binance_order_number));
          for (const order of buyOrders) {
            if (!syncedSet.has(order.order_number)) {
              findings.push({
                scan_id: scanId,
                finding_type: "missing_purchase",
                severity: "critical",
                category: "orders",
                asset: order.asset,
                terminal_ref: order.order_number,
                terminal_amount: parseFloat(order.total_price || "0"),
                variance: parseFloat(order.total_price || "0"),
                suggested_action: "create_purchase",
                confidence: 0.95,
                ai_reasoning: `BUY order ${order.order_number} for ${order.asset} (₹${order.total_price}) completed on Binance but has no corresponding purchase entry in ERP. Counterparty: ${order.counter_part_nick_name || 'Unknown'}.`,
                details: { counterparty: order.counter_part_nick_name, pay_method: order.pay_method_name, qty: order.amount, price: order.unit_price, commission: order.commission, create_time: order.create_time },
              });
            }
          }
        }
      } catch (e) { console.error("Module 1 error:", e); }
    }

    // ============================================================
    // MODULE 2: Missing Sale Entries (SELL orders not in ERP)
    // ============================================================
    if (scopeAll || scope.includes("orders")) {
      try {
        const { data: sellOrders } = await supabase
          .from("binance_order_history")
          .select("order_number, asset, total_price, amount, unit_price, commission, counter_part_nick_name, create_time, pay_method_name")
          .eq("trade_type", "SELL")
          .eq("order_status", "COMPLETED")
          .gte("create_time", todayStartEpochMs);

        if (sellOrders?.length) {
          const orderNums = sellOrders.map(o => o.order_number);

          // Check big sales sync
          const { data: syncedBigSales } = await supabase
            .from("terminal_sales_sync")
            .select("binance_order_number")
            .in("binance_order_number", orderNums);

          // Check small sales order map
          const { data: syncedSmallSales } = await supabase
            .from("small_sales_order_map")
            .select("binance_order_number")
            .in("binance_order_number", orderNums);

          const syncedSet = new Set([
            ...(syncedBigSales || []).map(s => s.binance_order_number),
            ...(syncedSmallSales || []).map(s => s.binance_order_number),
          ]);

          for (const order of sellOrders) {
            if (!syncedSet.has(order.order_number)) {
              const totalPrice = parseFloat(order.total_price || "0");
              // Classify as potential small sale vs big sale
              const isSmallRange = totalPrice >= 200 && totalPrice <= 4000;
              findings.push({
                scan_id: scanId,
                finding_type: isSmallRange ? "missing_small_sale" : "missing_sale",
                severity: "critical",
                category: "orders",
                asset: order.asset,
                terminal_ref: order.order_number,
                terminal_amount: totalPrice,
                variance: totalPrice,
                suggested_action: isSmallRange ? "include_small_sales" : "create_sales",
                confidence: 0.92,
                ai_reasoning: `SELL order ${order.order_number} for ${order.asset} (₹${order.total_price}) is completed on Binance but missing from ${isSmallRange ? 'Small Sales sync' : 'Big Sales sync'}. ${isSmallRange ? 'Amount falls within Small Sales range (₹200-₹4,000).' : 'Amount exceeds Small Sales threshold.'}`,
                details: { counterparty: order.counter_part_nick_name, pay_method: order.pay_method_name, qty: order.amount, price: order.unit_price, commission: order.commission, create_time: order.create_time },
              });
            }
          }
        }
      } catch (e) { console.error("Module 2 error:", e); }
    }

    // ============================================================
    // MODULE 3: Duplicate Entry Detection
    // ============================================================
    if (scopeAll || scope.includes("orders")) {
      try {
        // Check purchase sync duplicates
        const { data: purchaseSyncs } = await supabase
          .from("terminal_purchase_sync")
          .select("binance_order_number, id");

        if (purchaseSyncs?.length) {
          const countMap: Record<string, string[]> = {};
          for (const s of purchaseSyncs) {
            if (!countMap[s.binance_order_number]) countMap[s.binance_order_number] = [];
            countMap[s.binance_order_number].push(s.id);
          }
          for (const [orderNum, ids] of Object.entries(countMap)) {
            if (ids.length > 1) {
              findings.push({
                scan_id: scanId,
                finding_type: "duplicate_entry",
                severity: "critical",
                category: "orders",
                terminal_ref: orderNum,
                suggested_action: "reverse_duplicate",
                confidence: 0.99,
                ai_reasoning: `Purchase order ${orderNum} has ${ids.length} sync entries in terminal_purchase_sync. This may cause double inventory credit and inflated purchase records. Immediate review recommended.`,
                details: { sync_ids: ids, entry_type: "purchase" },
              });
            }
          }
        }

        // Check sales sync duplicates
        const { data: salesSyncs } = await supabase
          .from("terminal_sales_sync")
          .select("binance_order_number, id");

        if (salesSyncs?.length) {
          const countMap: Record<string, string[]> = {};
          for (const s of salesSyncs) {
            if (!countMap[s.binance_order_number]) countMap[s.binance_order_number] = [];
            countMap[s.binance_order_number].push(s.id);
          }
          for (const [orderNum, ids] of Object.entries(countMap)) {
            if (ids.length > 1) {
              findings.push({
                scan_id: scanId,
                finding_type: "duplicate_entry",
                severity: "critical",
                category: "orders",
                terminal_ref: orderNum,
                suggested_action: "reverse_duplicate",
                confidence: 0.99,
                ai_reasoning: `Sales order ${orderNum} has ${ids.length} sync entries in terminal_sales_sync. Potential double deduction of inventory and revenue duplication.`,
                details: { sync_ids: ids, entry_type: "sales" },
              });
            }
          }
        }
      } catch (e) { console.error("Module 3 error:", e); }
    }

    // ============================================================
    // MODULE 4: Amount Mismatch Detection
    // ============================================================
    if (scopeAll || scope.includes("financial")) {
      try {
        // Purchase amount mismatches
        const { data: purchaseSyncsWithOrders } = await supabase
          .from("terminal_purchase_sync")
          .select("binance_order_number, total_price, quantity, price_per_unit, commission, purchase_order_id");

        if (purchaseSyncsWithOrders?.length) {
          for (const sync of purchaseSyncsWithOrders) {
            if (!sync.purchase_order_id) continue;
            const { data: po } = await supabase
              .from("purchase_orders")
              .select("total_amount, quantity, price_per_unit, platform_fee")
              .eq("id", sync.purchase_order_id)
              .single();

            if (po) {
              const amtVariance = Math.abs((sync.total_price || 0) - (po.total_amount || 0));
              if (amtVariance > 0.50) {
                findings.push({
                  scan_id: scanId,
                  finding_type: "amount_mismatch",
                  severity: amtVariance > 100 ? "critical" : "warning",
                  category: "financial",
                  terminal_ref: sync.binance_order_number,
                  erp_ref: sync.purchase_order_id,
                  terminal_amount: sync.total_price,
                  erp_amount: po.total_amount,
                  variance: amtVariance,
                  suggested_action: "adjust_amount",
                  confidence: 0.90,
                  ai_reasoning: `Purchase ${sync.binance_order_number}: Terminal shows ₹${sync.total_price} but ERP recorded ₹${po.total_amount}. Variance of ₹${amtVariance.toFixed(2)} detected. This could indicate a rounding issue or partial payment recording.`,
                  details: { terminal_qty: sync.quantity, erp_qty: po.quantity, terminal_price: sync.price_per_unit, erp_price: po.price_per_unit },
                });
              }
            }
          }
        }

        // Sales amount mismatches
        const { data: salesSyncsWithOrders } = await supabase
          .from("terminal_sales_sync")
          .select("binance_order_number, total_price, quantity, price_per_unit, commission, sales_order_id");

        if (salesSyncsWithOrders?.length) {
          for (const sync of salesSyncsWithOrders) {
            if (!sync.sales_order_id) continue;
            const { data: so } = await supabase
              .from("sales_orders")
              .select("total_amount, quantity, price_per_unit, fee_amount")
              .eq("id", sync.sales_order_id)
              .single();

            if (so) {
              const amtVariance = Math.abs((sync.total_price || 0) - (so.total_amount || 0));
              if (amtVariance > 0.50) {
                findings.push({
                  scan_id: scanId,
                  finding_type: "amount_mismatch",
                  severity: amtVariance > 100 ? "critical" : "warning",
                  category: "financial",
                  terminal_ref: sync.binance_order_number,
                  erp_ref: sync.sales_order_id,
                  terminal_amount: sync.total_price,
                  erp_amount: so.total_amount,
                  variance: amtVariance,
                  suggested_action: "adjust_amount",
                  confidence: 0.90,
                  ai_reasoning: `Sales ${sync.binance_order_number}: Terminal shows ₹${sync.total_price} but ERP recorded ₹${so.total_amount}. Variance of ₹${amtVariance.toFixed(2)}.`,
                  details: { terminal_qty: sync.quantity, erp_qty: so.quantity, terminal_price: sync.price_per_unit, erp_price: so.price_per_unit },
                });
              }
            }
          }
        }
      } catch (e) { console.error("Module 4 error:", e); }
    }

    // ============================================================
    // MODULE 5: Fee Reconciliation
    // ============================================================
    if (scopeAll || scope.includes("financial")) {
      try {
        const { data: salesSyncsWithFees } = await supabase
          .from("terminal_sales_sync")
          .select("binance_order_number, commission, sales_order_id");

        if (salesSyncsWithFees?.length) {
          for (const sync of salesSyncsWithFees) {
            if (!sync.sales_order_id || !sync.commission) continue;
            const { data: so } = await supabase
              .from("sales_orders")
              .select("fee_amount")
              .eq("id", sync.sales_order_id)
              .single();

            if (so) {
              const terminalFee = parseFloat(String(sync.commission));
              const erpFee = so.fee_amount || 0;
              const feeVariance = Math.abs(terminalFee - erpFee);
              if (feeVariance > 0.01) {
                findings.push({
                  scan_id: scanId,
                  finding_type: "fee_variance",
                  severity: feeVariance > 10 ? "warning" : "review",
                  category: "fees",
                  terminal_ref: sync.binance_order_number,
                  erp_ref: sync.sales_order_id,
                  terminal_amount: terminalFee,
                  erp_amount: erpFee,
                  variance: feeVariance,
                  suggested_action: "adjust_fee",
                  confidence: 0.88,
                  ai_reasoning: `Fee mismatch on ${sync.binance_order_number}: Binance charged ${terminalFee} but ERP recorded ${erpFee}. Variance: ${feeVariance.toFixed(4)}. This can affect profit calculations.`,
                  details: {},
                });
              }
            }
          }
        }
      } catch (e) { console.error("Module 5 error:", e); }
    }

    // ============================================================
    // MODULE 6: Wallet Balance Gap
    // ============================================================
    if (scopeAll || scope.includes("balances")) {
      try {
        const { data: walletLinks } = await supabase
          .from("terminal_wallet_links")
          .select("wallet_id, api_identifier, supported_assets")
          .eq("status", "active");

        if (walletLinks?.length) {
          for (const link of walletLinks) {
            const { data: erpBalances } = await supabase
              .from("wallet_asset_balances")
              .select("asset_code, balance")
              .eq("wallet_id", link.wallet_id);

            if (erpBalances?.length) {
              for (const bal of erpBalances) {
                if (bal.balance !== 0 && bal.balance !== null) {
                  // We can flag wallets with significant balances for review
                  // Actual API comparison would require calling binance-assets function
                  // For now, we check for negative ERP balances (should never happen)
                  if (bal.balance < 0) {
                    findings.push({
                      scan_id: scanId,
                      finding_type: "wallet_balance_gap",
                      severity: "critical",
                      category: "balances",
                      asset: bal.asset_code,
                      erp_ref: link.wallet_id,
                      erp_amount: bal.balance,
                      variance: Math.abs(bal.balance),
                      suggested_action: "wallet_adjustment",
                      confidence: 0.98,
                      ai_reasoning: `Wallet ${link.api_identifier} has a NEGATIVE ${bal.asset_code} balance of ${bal.balance}. This indicates over-deduction and requires immediate correction. Possible causes: duplicate debit entries, missing deposit records, or incorrect manual adjustments.`,
                      details: { wallet_id: link.wallet_id, api_identifier: link.api_identifier },
                    });
                  }
                }
              }
            }
          }
        }
      } catch (e) { console.error("Module 6 error:", e); }
    }

    // ============================================================
    // MODULE 7: Unrecorded Deposits
    // ============================================================
    if (scopeAll || scope.includes("movements")) {
      try {
        const { data: deposits } = await supabase
          .from("asset_movement_history")
          .select("id, asset, amount, movement_time, tx_id, network, status")
          .eq("movement_type", "deposit")
          .eq("status", "completed");

        if (deposits?.length) {
          const depositIds = deposits.map(d => d.id);
          const { data: processedActions } = await supabase
            .from("erp_action_queue")
            .select("movement_id")
            .in("movement_id", depositIds)
            .eq("status", "processed");

          const processedSet = new Set((processedActions || []).map(a => a.movement_id));

          for (const dep of deposits) {
            if (!processedSet.has(dep.id)) {
              findings.push({
                scan_id: scanId,
                finding_type: "unrecorded_deposit",
                severity: "warning",
                category: "movements",
                asset: dep.asset,
                terminal_ref: dep.tx_id || dep.id,
                terminal_amount: dep.amount,
                variance: dep.amount,
                suggested_action: "record_deposit",
                confidence: 0.85,
                ai_reasoning: `Deposit of ${dep.amount} ${dep.asset} (network: ${dep.network || 'N/A'}) is confirmed on-chain but has no processed ERP action queue entry. This deposit may not be reflected in wallet balances.`,
                details: { movement_id: dep.id, network: dep.network, movement_time: dep.movement_time },
              });
            }
          }
        }
      } catch (e) { console.error("Module 7 error:", e); }
    }

    // ============================================================
    // MODULE 8: Unrecorded Withdrawals
    // ============================================================
    if (scopeAll || scope.includes("movements")) {
      try {
        const { data: withdrawals } = await supabase
          .from("asset_movement_history")
          .select("id, asset, amount, movement_time, tx_id, network, status, fee")
          .eq("movement_type", "withdrawal")
          .eq("status", "completed");

        if (withdrawals?.length) {
          const wdIds = withdrawals.map(w => w.id);
          const { data: processedActions } = await supabase
            .from("erp_action_queue")
            .select("movement_id")
            .in("movement_id", wdIds)
            .eq("status", "processed");

          const processedSet = new Set((processedActions || []).map(a => a.movement_id));

          for (const wd of withdrawals) {
            if (!processedSet.has(wd.id)) {
              findings.push({
                scan_id: scanId,
                finding_type: "unrecorded_withdrawal",
                severity: "warning",
                category: "movements",
                asset: wd.asset,
                terminal_ref: wd.tx_id || wd.id,
                terminal_amount: wd.amount,
                variance: wd.amount,
                suggested_action: "record_withdrawal",
                confidence: 0.85,
                ai_reasoning: `Withdrawal of ${wd.amount} ${wd.asset} (fee: ${wd.fee || 0}) is confirmed but has no processed ERP entry. Wallet balance may be overstated by this amount.`,
                details: { movement_id: wd.id, network: wd.network, fee: wd.fee, movement_time: wd.movement_time },
              });
            }
          }
        }
      } catch (e) { console.error("Module 8 error:", e); }
    }

    // ============================================================
    // MODULE 9: Spot Trade / Conversion Gap
    // ============================================================
    if (scopeAll || scope.includes("conversions")) {
      try {
        const { data: spotTrades } = await supabase
          .from("spot_trade_history")
          .select("id, symbol, side, qty, price, commission, commission_asset, time, order_id");

        if (spotTrades?.length) {
          const tradeIds = spotTrades.map(t => t.id);
          const { data: linkedConversions } = await supabase
            .from("erp_product_conversions")
            .select("spot_trade_id")
            .in("spot_trade_id", tradeIds);

          const linkedSet = new Set((linkedConversions || []).map(c => c.spot_trade_id));

          for (const trade of spotTrades) {
            if (!linkedSet.has(trade.id)) {
              findings.push({
                scan_id: scanId,
                finding_type: "conversion_gap",
                severity: "review",
                category: "conversions",
                asset: trade.symbol,
                terminal_ref: trade.order_id || trade.id,
                terminal_amount: parseFloat(String(trade.qty || 0)) * parseFloat(String(trade.price || 0)),
                suggested_action: "record_conversion",
                confidence: 0.80,
                ai_reasoning: `Spot trade ${trade.symbol} (${trade.side}) for qty ${trade.qty} @ ${trade.price} has no linked ERP conversion entry. This trade's P&L and inventory impact is not reflected in the WAC system.`,
                details: { side: trade.side, qty: trade.qty, price: trade.price, commission: trade.commission, commission_asset: trade.commission_asset, time: trade.time },
              });
            }
          }
        }
      } catch (e) { console.error("Module 9 error:", e); }
    }

    // ============================================================
    // MODULE 10: Orphan ERP Conversions (no spot trade backing)
    // ============================================================
    if (scopeAll || scope.includes("conversions")) {
      try {
        const { data: conversions } = await supabase
          .from("erp_product_conversions")
          .select("id, asset_code, side, quantity, price_usd, spot_trade_id, source, status, reference_no")
          .eq("status", "approved")
          .not("source", "eq", "manual");

        if (conversions?.length) {
          for (const conv of conversions) {
            if (conv.spot_trade_id) {
              const { data: trade } = await supabase
                .from("spot_trade_history")
                .select("id")
                .eq("id", conv.spot_trade_id)
                .maybeSingle();

              if (!trade) {
                findings.push({
                  scan_id: scanId,
                  finding_type: "conversion_gap",
                  severity: "review",
                  category: "conversions",
                  asset: conv.asset_code,
                  erp_ref: conv.reference_no || conv.id,
                  erp_amount: conv.quantity * conv.price_usd,
                  suggested_action: "review_conversion",
                  confidence: 0.75,
                  ai_reasoning: `ERP conversion ${conv.reference_no || conv.id} (${conv.asset_code} ${conv.side}) references spot_trade_id ${conv.spot_trade_id} which doesn't exist in spot_trade_history. The backing trade may have been deleted or the reference is incorrect.`,
                  details: { conversion_id: conv.id, side: conv.side, qty: conv.quantity },
                });
              }
            }
          }
        }
      } catch (e) { console.error("Module 10 error:", e); }
    }

    // ============================================================
    // MODULE 11: Client Mapping Intelligence (name variations)
    // ============================================================
    if (scopeAll || scope.includes("clients")) {
      try {
        const { data: counterparties } = await supabase
          .from("counterparty_contact_records")
          .select("counterparty_nickname, contact_number");

        if (counterparties?.length) {
          // Group by similar names (simple: same first 5 chars lowercase)
          const groups: Record<string, typeof counterparties> = {};
          for (const cp of counterparties) {
            const key = cp.counterparty_nickname.toLowerCase().trim().substring(0, 6);
            if (!groups[key]) groups[key] = [];
            groups[key].push(cp);
          }

          for (const [, group] of Object.entries(groups)) {
            if (group.length > 1) {
              const names = group.map(g => g.counterparty_nickname);
              const uniqueNames = [...new Set(names)];
              if (uniqueNames.length > 1) {
                findings.push({
                  scan_id: scanId,
                  finding_type: "unmapped_client",
                  severity: "review",
                  category: "clients",
                  suggested_action: "merge_clients",
                  confidence: 0.70,
                  ai_reasoning: `Potential duplicate clients detected with similar names: ${uniqueNames.join(', ')}. These may represent the same counterparty with name variations. Merging would consolidate transaction history and improve reporting accuracy.`,
                  details: { names: uniqueNames, contacts: group.map(g => g.contact_number).filter(Boolean) },
                });
              }
            }
          }
        }
      } catch (e) { console.error("Module 11 error:", e); }
    }

    // ============================================================
    // MODULE 12: Small Sales Coverage Gaps
    // ============================================================
    if (scopeAll || scope.includes("orders")) {
      try {
        // Get small sales config
        const { data: ssConfig } = await supabase
          .from("small_sales_config")
          .select("is_enabled, min_amount, max_amount")
          .limit(1)
          .maybeSingle();

        if (ssConfig?.is_enabled) {
          const min = ssConfig.min_amount;
          const max = ssConfig.max_amount;

          // Get SELL orders in small sales range
          const { data: smallRangeOrders } = await supabase
            .from("binance_order_history")
            .select("order_number, asset, total_price, create_time")
            .eq("trade_type", "SELL")
            .eq("order_status", "COMPLETED")
            .gte("create_time", todayStartEpochMs)
            .gte("total_price", String(min))
            .lte("total_price", String(max));

          if (smallRangeOrders?.length) {
            const orderNums = smallRangeOrders.map(o => o.order_number);
            const { data: mapped } = await supabase
              .from("small_sales_order_map")
              .select("binance_order_number")
              .in("binance_order_number", orderNums);

            const { data: bigSalesSynced } = await supabase
              .from("terminal_sales_sync")
              .select("binance_order_number")
              .in("binance_order_number", orderNums);

            const coveredSet = new Set([
              ...(mapped || []).map(m => m.binance_order_number),
              ...(bigSalesSynced || []).map(s => s.binance_order_number),
            ]);

            for (const order of smallRangeOrders) {
              if (!coveredSet.has(order.order_number)) {
                findings.push({
                  scan_id: scanId,
                  finding_type: "small_sales_gap",
                  severity: "warning",
                  category: "orders",
                  asset: order.asset,
                  terminal_ref: order.order_number,
                  terminal_amount: parseFloat(order.total_price || "0"),
                  suggested_action: "include_small_sales",
                  confidence: 0.88,
                  ai_reasoning: `SELL order ${order.order_number} (₹${order.total_price}) falls within the Small Sales range (₹${min}-₹${max}) but is not in any sync pipeline. It may have been missed during the last sync window.`,
                  details: { create_time: order.create_time },
                });
              }
            }
          }
        }
      } catch (e) { console.error("Module 12 error:", e); }
    }

    // ============================================================
    // MODULE 13: Payment Method Drift
    // ============================================================
    if (scopeAll || scope.includes("payments")) {
      try {
        const { data: orders } = await supabase
          .from("binance_order_history")
          .select("order_number, pay_method_name")
          .eq("order_status", "COMPLETED")
          .gte("create_time", todayStartEpochMs)
          .not("pay_method_name", "is", null);

        if (orders?.length) {
          const { data: paymentMethods } = await supabase
            .from("payment_methods_master")
            .select("display_name, short_name");

          const knownMethods = new Set((paymentMethods || []).flatMap(pm => [
            pm.display_name?.toLowerCase(),
            pm.short_name?.toLowerCase(),
          ].filter(Boolean)));

          const unmappedMethods = new Map<string, number>();
          for (const order of orders) {
            const method = order.pay_method_name?.toLowerCase();
            if (method && !knownMethods.has(method)) {
              unmappedMethods.set(method, (unmappedMethods.get(method) || 0) + 1);
            }
          }

          for (const [method, count] of unmappedMethods.entries()) {
            if (count >= 3) {
              findings.push({
                scan_id: scanId,
                finding_type: "payment_method_drift",
                severity: "info",
                category: "payments",
                suggested_action: "map_payment_method",
                confidence: 0.65,
                ai_reasoning: `Payment method "${method}" appears in ${count} Binance orders but is not mapped in ERP payment methods master. This may cause payment reconciliation issues or bank account mapping failures.`,
                details: { method_name: method, occurrence_count: count },
              });
            }
          }
        }
      } catch (e) { console.error("Module 13 error:", e); }
    }

    // ============================================================
    // MODULE 14: Stale Pending Sync Entries
    // ============================================================
    if (scopeAll || scope.includes("orders")) {
      try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: stalePurchases } = await supabase
          .from("terminal_purchase_sync")
          .select("id, binance_order_number, total_price, asset, synced_at")
          .eq("sync_status", "pending_approval")
          .lt("synced_at", oneDayAgo);

        if (stalePurchases?.length) {
          for (const sp of stalePurchases) {
            findings.push({
              scan_id: scanId,
              finding_type: "stale_pending",
              severity: "review",
              category: "orders",
              asset: sp.asset,
              terminal_ref: sp.binance_order_number,
              erp_ref: sp.id,
              terminal_amount: sp.total_price,
              suggested_action: "review_pending",
              confidence: 0.75,
              ai_reasoning: `Purchase sync entry ${sp.binance_order_number} has been pending approval for over 24 hours (synced at ${sp.synced_at}). Stale pending entries can indicate workflow bottlenecks or missed approvals.`,
              details: { synced_at: sp.synced_at },
            });
          }
        }

        const { data: staleSales } = await supabase
          .from("terminal_sales_sync")
          .select("id, binance_order_number, total_price, asset, synced_at")
          .eq("sync_status", "pending_approval")
          .lt("synced_at", oneDayAgo);

        if (staleSales?.length) {
          for (const ss of staleSales) {
            findings.push({
              scan_id: scanId,
              finding_type: "stale_pending",
              severity: "review",
              category: "orders",
              asset: ss.asset,
              terminal_ref: ss.binance_order_number,
              erp_ref: ss.id,
              terminal_amount: ss.total_price,
              suggested_action: "review_pending",
              confidence: 0.75,
              ai_reasoning: `Sales sync entry ${ss.binance_order_number} has been pending approval for over 24 hours. Review to ensure timely processing.`,
              details: { synced_at: ss.synced_at },
            });
          }
        }
      } catch (e) { console.error("Module 14 error:", e); }
    }

    // ============================================================
    // INSERT ALL FINDINGS
    // ============================================================
    if (findings.length > 0) {
      // Batch insert in chunks of 100
      for (let i = 0; i < findings.length; i += 100) {
        const chunk = findings.slice(i, i + 100);
        await supabase.from("reconciliation_findings").insert(chunk);
      }
    }

    // Count by severity
    const criticalCount = findings.filter(f => f.severity === "critical").length;
    const warningCount = findings.filter(f => f.severity === "warning").length;
    const reviewCount = findings.filter(f => f.severity === "review").length;
    const infoCount = findings.filter(f => f.severity === "info").length;
    const durationMs = Date.now() - startTime;

    // Generate AI summary
    let aiSummary = `Scan completed in ${(durationMs / 1000).toFixed(1)}s. Found ${findings.length} issue(s): ${criticalCount} critical, ${warningCount} warnings, ${reviewCount} for review, ${infoCount} informational.`;
    if (criticalCount > 0) {
      aiSummary += ` ⚠️ Critical issues require immediate attention - missing entries or duplicates detected.`;
    }
    if (findings.length === 0) {
      aiSummary = `Scan completed in ${(durationMs / 1000).toFixed(1)}s. No discrepancies found. All Terminal orders appear correctly reflected in ERP.`;
    }

    // Update scan log
    await supabase
      .from("reconciliation_scan_log")
      .update({
        findings_count: findings.length,
        critical_count: criticalCount,
        warning_count: warningCount,
        review_count: reviewCount,
        info_count: infoCount,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        status: "completed",
        ai_summary: aiSummary,
      })
      .eq("id", scanId);

    return new Response(JSON.stringify({
      scan_id: scanId,
      findings_count: findings.length,
      critical_count: criticalCount,
      warning_count: warningCount,
      review_count: reviewCount,
      info_count: infoCount,
      duration_ms: durationMs,
      ai_summary: aiSummary,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Reconciliation scan error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
