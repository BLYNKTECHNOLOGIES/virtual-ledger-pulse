import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SnapshotLine {
  snapshot_id: string;
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  asset_code: string | null;
  tracked_balance: number;
  calculated_balance: number | null;
  metadata: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Parse optional params
    let snapshotType = "SCHEDULED";
    try {
      const body = await req.json();
      if (body?.snapshot_type) snapshotType = body.snapshot_type;
    } catch {
      // No body = scheduled run
    }

    // 1. Create snapshot header
    const { data: snapshot, error: snapError } = await supabase
      .from("erp_balance_snapshots")
      .insert({ snapshot_type: snapshotType })
      .select("id")
      .single();

    if (snapError) throw snapError;
    const snapshotId = snapshot.id;

    const lines: SnapshotLine[] = [];

    // ═══════════════════════════════════════════════════
    // 2. WALLET ASSET BALANCES (tracked + calculated)
    // ═══════════════════════════════════════════════════
    const { data: walletAssets } = await supabase
      .from("wallet_asset_balances")
      .select("wallet_id, asset_code, balance, total_received, total_sent");

    const { data: wallets } = await supabase
      .from("wallets")
      .select("id, wallet_name, current_balance, total_received, total_sent, is_active");

    const walletNameMap = new Map(
      (wallets || []).map((w: any) => [w.id, w.wallet_name])
    );

    // Get calculated USDT balances from wallet_transactions SUM
    const { data: walletCalcRows } = await supabase.rpc("get_wallet_calculated_balances");

    // Map by wallet_id for USDT summary comparison
    const walletCalcMap = new Map<string, number>();
    if (walletCalcRows) {
      for (const r of walletCalcRows as any[]) {
        walletCalcMap.set(r.wallet_id, Number(r.calculated_balance));
      }
    }

    // Per-asset wallet calculated balances (Layer 2)
    const { data: walletAssetCalcRows } = await supabase.rpc(
      "get_wallet_calculated_balances_per_asset"
    );
    const walletAssetCalcMap = new Map<string, number>();
    if (walletAssetCalcRows) {
      for (const r of walletAssetCalcRows as any[]) {
        walletAssetCalcMap.set(`${r.wallet_id}::${r.asset_code}`, Number(r.calculated_balance));
      }
    }

    for (const wa of walletAssets || []) {
      const calcKey = `${wa.wallet_id}::${wa.asset_code}`;
      lines.push({
        snapshot_id: snapshotId,
        entity_type: "WALLET_ASSET",
        entity_id: wa.wallet_id,
        entity_name: walletNameMap.get(wa.wallet_id) || null,
        asset_code: wa.asset_code,
        tracked_balance: Number(wa.balance || 0),
        calculated_balance: walletAssetCalcMap.has(calcKey)
          ? walletAssetCalcMap.get(calcKey)!
          : null,
        metadata: {
          total_received: wa.total_received,
          total_sent: wa.total_sent,
        },
      });
    }

    // Wallet summary rows (wallets.current_balance vs calculated from transactions)
    for (const w of wallets || []) {
      lines.push({
        snapshot_id: snapshotId,
        entity_type: "WALLET_SUMMARY",
        entity_id: w.id,
        entity_name: w.wallet_name,
        asset_code: null,
        tracked_balance: Number(w.current_balance || 0),
        calculated_balance: walletCalcMap.get(w.id) ?? null,
        metadata: {
          is_active: w.is_active,
          total_received: w.total_received,
          total_sent: w.total_sent,
        },
      });
    }

    // ═══════════════════════════════════════════════════
    // 3. BANK ACCOUNT BALANCES
    // ═══════════════════════════════════════════════════
    const { data: bankAccounts } = await supabase
      .from("bank_accounts")
      .select("id, account_name, balance, status, lien_amount, account_type");

    // Get calculated bank balances
    const { data: bankCalcRows } = await supabase.rpc("get_bank_calculated_balances");

    const bankCalcMap = new Map<string, number>();
    if (bankCalcRows) {
      for (const r of bankCalcRows as any[]) {
        bankCalcMap.set(r.bank_account_id, Number(r.calculated_balance));
      }
    }

    for (const ba of bankAccounts || []) {
      lines.push({
        snapshot_id: snapshotId,
        entity_type: "BANK_ACCOUNT",
        entity_id: ba.id,
        entity_name: ba.account_name,
        asset_code: null,
        tracked_balance: Number(ba.balance || 0),
        calculated_balance: bankCalcMap.get(ba.id) ?? null,
        metadata: {
          status: ba.status,
          lien_amount: ba.lien_amount,
          account_type: ba.account_type,
        },
      });
    }

    // ═══════════════════════════════════════════════════
    // 4. PRODUCT STOCK LEVELS
    // ═══════════════════════════════════════════════════
    const { data: products } = await supabase
      .from("products")
      .select("id, name, code, current_stock_quantity, total_purchases, total_sales");

    for (const p of products || []) {
      lines.push({
        snapshot_id: snapshotId,
        entity_type: "PRODUCT_STOCK",
        entity_id: p.id,
        entity_name: p.name,
        asset_code: p.code,
        tracked_balance: Number(p.current_stock_quantity || 0),
        calculated_balance: null,
        metadata: {
          total_purchases: p.total_purchases,
          total_sales: p.total_sales,
        },
      });
    }

    // ═══════════════════════════════════════════════════
    // 5. CLIENT MONTHLY USAGE
    // ═══════════════════════════════════════════════════
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name, client_id, current_month_used, monthly_limit")
      .eq("is_deleted", false)
      .gt("monthly_limit", 0);

    for (const c of clients || []) {
      lines.push({
        snapshot_id: snapshotId,
        entity_type: "CLIENT_USAGE",
        entity_id: c.id,
        entity_name: c.name,
        asset_code: null,
        tracked_balance: Number(c.current_month_used || 0),
        calculated_balance: null,
        metadata: {
          client_id: c.client_id,
          monthly_limit: c.monthly_limit,
        },
      });
    }

    // ═══════════════════════════════════════════════════
    // 6. PAYMENT METHOD USAGE
    // ═══════════════════════════════════════════════════
    const { data: payMethods } = await supabase
      .from("sales_payment_methods")
      .select("id, nickname, type, current_usage, payment_limit, is_active")
      .eq("is_active", true);

    for (const pm of payMethods || []) {
      lines.push({
        snapshot_id: snapshotId,
        entity_type: "PAYMENT_METHOD",
        entity_id: pm.id,
        entity_name: pm.nickname || pm.type,
        asset_code: null,
        tracked_balance: Number(pm.current_usage || 0),
        calculated_balance: null,
        metadata: {
          type: pm.type,
          payment_limit: pm.payment_limit,
        },
      });
    }

    // ═══════════════════════════════════════════════════
    // 7. WALLET ASSET POSITIONS (cost accounting)
    // ═══════════════════════════════════════════════════
    const { data: positions } = await supabase
      .from("wallet_asset_positions")
      .select("id, wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt");

    for (const pos of positions || []) {
      lines.push({
        snapshot_id: snapshotId,
        entity_type: "ASSET_POSITION",
        entity_id: pos.wallet_id,
        entity_name: walletNameMap.get(pos.wallet_id) || null,
        asset_code: pos.asset_code,
        tracked_balance: Number(pos.qty_on_hand || 0),
        calculated_balance: null,
        metadata: {
          cost_pool_usdt: pos.cost_pool_usdt,
          avg_cost_usdt: pos.avg_cost_usdt,
        },
      });
    }

    // ═══════════════════════════════════════════════════
    // 8. Insert all lines in batches
    // ═══════════════════════════════════════════════════
    const BATCH_SIZE = 500;
    for (let i = 0; i < lines.length; i += BATCH_SIZE) {
      const batch = lines.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase
        .from("erp_balance_snapshot_lines")
        .insert(batch);
      if (insertError) throw insertError;
    }

    // 9. Update snapshot summary
    const driftCount = lines.filter(
      (l) => l.calculated_balance !== null && Math.abs(l.tracked_balance - l.calculated_balance) > 0.01
    ).length;

    const summary = {
      total_entities: lines.length,
      wallet_assets: lines.filter((l) => l.entity_type === "WALLET_ASSET").length,
      bank_accounts: lines.filter((l) => l.entity_type === "BANK_ACCOUNT").length,
      products: lines.filter((l) => l.entity_type === "PRODUCT_STOCK").length,
      clients: lines.filter((l) => l.entity_type === "CLIENT_USAGE").length,
      payment_methods: lines.filter((l) => l.entity_type === "PAYMENT_METHOD").length,
      asset_positions: lines.filter((l) => l.entity_type === "ASSET_POSITION").length,
      entities_with_drift: driftCount,
    };

    await supabase
      .from("erp_balance_snapshots")
      .update({ summary })
      .eq("id", snapshotId);

    // ═══════════════════════════════════════════════════
    // 9b. DRIFT ALERTS — Layer 2: emit + auto-resolve
    // ═══════════════════════════════════════════════════
    // Adjustment-bucket exclusion: never alert on the audit contra-wallet
    const ADJUSTMENT_WALLET_ID = "1ef0342f-b0ee-41c5-b3c1-8f589696ad0b";

    const thresholdFor = (assetCode: string | null): number => {
      const a = (assetCode || "").toUpperCase();
      if (a === "USDT" || a === "USDC" || a === "FDUSD") return 1;
      if (a === "INR") return 10;
      if (a === "BTC") return 0.0001;
      return 0.001;
    };

    const driftLines = lines.filter((l) => {
      if (l.calculated_balance === null) return false;
      if (l.entity_id === ADJUSTMENT_WALLET_ID) return false;
      const threshold =
        l.entity_type === "BANK_ACCOUNT"
          ? 10
          : thresholdFor(l.asset_code);
      return Math.abs(l.tracked_balance - (l.calculated_balance ?? 0)) > threshold;
    });

    // Build alert keys for the current snapshot
    const currentAlertKeys = new Set(
      driftLines.map((l) => `${l.entity_type}::${l.entity_id}::${l.asset_code ?? ""}`)
    );

    // Insert/refresh alerts (upsert by composite key — open rows only)
    if (driftLines.length > 0) {
      const alertRows = driftLines.map((l) => {
        const drift = Number(l.tracked_balance) - Number(l.calculated_balance ?? 0);
        const absDrift = Math.abs(drift);
        const sev =
          absDrift > 1000 ? "CRITICAL" : absDrift > 100 ? "HIGH" : absDrift > 10 ? "MEDIUM" : "LOW";
        return {
          snapshot_id: snapshotId,
          entity_type: l.entity_type,
          entity_id: l.entity_id,
          entity_name: l.entity_name,
          asset_code: l.asset_code,
          tracked_balance: l.tracked_balance,
          calculated_balance: l.calculated_balance,
          drift,
          severity: sev,
          source: "INTERNAL_SNAPSHOT",
          metadata: l.metadata,
        };
      });
      await supabase.from("erp_drift_alerts").insert(alertRows);
    }

    // Auto-resolve previously-open INTERNAL_SNAPSHOT alerts that are no longer drifting
    const { data: openAlerts } = await supabase
      .from("erp_drift_alerts")
      .select("id, entity_type, entity_id, asset_code")
      .is("resolved_at", null)
      .eq("source", "INTERNAL_SNAPSHOT");
    const toResolve = (openAlerts || [])
      .filter(
        (a: any) => !currentAlertKeys.has(`${a.entity_type}::${a.entity_id}::${a.asset_code ?? ""}`)
      )
      .map((a: any) => a.id);
    if (toResolve.length > 0) {
      await supabase
        .from("erp_drift_alerts")
        .update({ resolved_at: new Date().toISOString() })
        .in("id", toResolve);
    }

    // 10. Cleanup old snapshots (30 days) + expired records
    await supabase.rpc("cleanup_old_snapshots");
    await supabase.rpc("cleanup_expired_records");

    return new Response(
      JSON.stringify({
        success: true,
        snapshot_id: snapshotId,
        summary,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Snapshot error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
