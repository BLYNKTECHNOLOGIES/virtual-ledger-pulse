import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Captures, for each active Binance exchange account, the USDT balance recorded
// in the ERP (Asset Inventory > Wallet Distribution = ledger USDT of the wallets
// linked to that account) versus the actual live USDT balance in the terminal
// (Binance funding + spot). Intended to run at 04:00 IST and be consumed +
// erased by the 10:00 IST daily business report.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // IST snapshot date
    const istDate = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
    );
    const snapshotDate = `${istDate.getFullYear()}-${String(istDate.getMonth() + 1).padStart(2, "0")}-${String(istDate.getDate()).padStart(2, "0")}`;

    // All active exchange accounts (Blynk + ASEC)
    const { data: accounts, error: accErr } = await supabase
      .from("terminal_exchange_accounts")
      .select("id, account_name, is_active")
      .eq("is_active", true)
      .order("display_order");
    if (accErr) throw accErr;

    const results: any[] = [];

    for (const acct of accounts || []) {
      let erpUsdt = 0;
      let terminalUsdt: number | null = null;
      let status = "ok";
      let captureError: string | null = null;

      try {
        // ---- ERP side: ledger USDT of wallets linked to this exchange account
        const { data: links } = await supabase
          .from("terminal_wallet_links")
          .select("wallet_id")
          .eq("exchange_account_id", acct.id)
          .eq("status", "active");

        const walletIds = (links || []).map((l: any) => l.wallet_id);
        if (walletIds.length > 0) {
          const { data: balRows } = await supabase
            .from("wallet_asset_balances")
            .select("balance")
            .eq("asset_code", "USDT")
            .in("wallet_id", walletIds);
          erpUsdt = (balRows || []).reduce(
            (s: number, r: any) => s + Number(r.balance || 0),
            0,
          );
        }

        // ---- Terminal side: live Binance funding + spot USDT
        const { data: balData, error: invokeErr } = await supabase.functions.invoke(
          "binance-assets",
          { body: { action: "getBalances", exchange_account_id: acct.id } },
        );
        if (invokeErr) throw new Error(invokeErr.message);

        const balances: any[] = balData?.balances || [];
        const usdtRow = balances.find((b) => String(b.asset).toUpperCase() === "USDT");
        if (usdtRow) {
          terminalUsdt = Number(usdtRow.total_balance || 0);
        } else if (balData?.error) {
          throw new Error(String(balData.error));
        } else {
          // No USDT row returned but call succeeded => zero balance
          terminalUsdt = 0;
        }
      } catch (e) {
        status = "error";
        captureError = (e as Error).message?.slice(0, 500) ?? "unknown error";
        console.error(`snapshot failed for ${acct.account_name}:`, captureError);
      }

      const difference =
        terminalUsdt === null ? null : Number((erpUsdt - terminalUsdt).toFixed(8));

      const row = {
        snapshot_date: snapshotDate,
        exchange_account_id: acct.id,
        account_name: acct.account_name,
        erp_usdt_balance: Number(erpUsdt.toFixed(8)),
        terminal_usdt_balance: terminalUsdt,
        difference,
        capture_status: status,
        capture_error: captureError,
        captured_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await supabase
        .from("erp_terminal_balance_snapshots")
        .upsert(row, { onConflict: "snapshot_date,exchange_account_id" });
      if (upsertErr) console.error("upsert error:", upsertErr.message);

      results.push(row);
    }

    return new Response(
      JSON.stringify({ success: true, snapshot_date: snapshotDate, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("erp-terminal-balance-snapshot error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
