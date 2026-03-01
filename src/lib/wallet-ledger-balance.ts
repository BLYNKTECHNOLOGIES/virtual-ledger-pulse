import { supabase } from "@/integrations/supabase/client";

type WalletBase = {
  id: string;
  wallet_name: string;
  current_balance?: number | null;
  [key: string]: unknown;
};

export type WalletWithLedgerBalance = WalletBase & {
  current_balance: number;
};

export async function fetchActiveWalletsWithLedgerUsdtBalance(
  selectColumns = "id, wallet_name, current_balance"
): Promise<WalletWithLedgerBalance[]> {
  const [{ data: wallets, error: walletsError }, { data: usdtRows, error: usdtError }] = await Promise.all([
    supabase
      .from("wallets")
      .select(selectColumns)
      .eq("is_active", true)
      .order("wallet_name"),
    supabase
      .from("wallet_asset_balances")
      .select("wallet_id, balance")
      .eq("asset_code", "USDT"),
  ]);

  if (walletsError) throw walletsError;
  if (usdtError) throw usdtError;

  const usdtMap = new Map((usdtRows || []).map((row) => [row.wallet_id, Number(row.balance || 0)]));

  return (wallets || []).map((wallet: any) => {
    const hasLedger = usdtMap.has(wallet.id);
    return {
      ...wallet,
      current_balance: hasLedger ? (usdtMap.get(wallet.id) || 0) : Number(wallet.current_balance || 0),
    };
  });
}

export async function fetchWalletLedgerUsdtBalance(walletId: string): Promise<number> {
  const [{ data: ledgerRow, error: ledgerError }, { data: walletRow, error: walletError }] = await Promise.all([
    supabase
      .from("wallet_asset_balances")
      .select("balance")
      .eq("wallet_id", walletId)
      .eq("asset_code", "USDT")
      .maybeSingle(),
    supabase
      .from("wallets")
      .select("current_balance")
      .eq("id", walletId)
      .maybeSingle(),
  ]);

  if (ledgerError) throw ledgerError;
  if (walletError) throw walletError;

  if (ledgerRow?.balance !== null && ledgerRow?.balance !== undefined) {
    return Number(ledgerRow.balance || 0);
  }

  return Number(walletRow?.current_balance || 0);
}
