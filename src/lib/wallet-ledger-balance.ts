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

export async function fetchActiveWalletsWithLedgerAssetBalance(
  assetCode = "USDT",
  selectColumns = "id, wallet_name, current_balance"
): Promise<WalletWithLedgerBalance[]> {
  const normalizedAsset = String(assetCode || "USDT").toUpperCase();

  const [{ data: wallets, error: walletsError }, { data: assetRows, error: assetError }] = await Promise.all([
    supabase
      .from("wallets")
      .select(selectColumns)
      .eq("is_active", true)
      .order("wallet_name"),
    supabase
      .from("wallet_asset_balances")
      .select("wallet_id, balance")
      .eq("asset_code", normalizedAsset),
  ]);

  if (walletsError) throw walletsError;
  if (assetError) throw assetError;

  const assetMap = new Map((assetRows || []).map((row) => [row.wallet_id, Number(row.balance || 0)]));

  return (wallets || []).map((wallet: any) => {
    const hasLedger = assetMap.has(wallet.id);
    return {
      ...wallet,
      current_balance: hasLedger ? (assetMap.get(wallet.id) || 0) : Number(wallet.current_balance || 0),
    };
  });
}

export async function fetchActiveWalletsWithLedgerUsdtBalance(
  selectColumns = "id, wallet_name, current_balance"
): Promise<WalletWithLedgerBalance[]> {
  return fetchActiveWalletsWithLedgerAssetBalance("USDT", selectColumns);
}

export async function fetchWalletLedgerAssetBalance(walletId: string, assetCode = "USDT"): Promise<number> {
  const normalizedAsset = String(assetCode || "USDT").toUpperCase();

  const [{ data: ledgerRow, error: ledgerError }, { data: walletRow, error: walletError }] = await Promise.all([
    supabase
      .from("wallet_asset_balances")
      .select("balance")
      .eq("wallet_id", walletId)
      .eq("asset_code", normalizedAsset)
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

export async function fetchWalletLedgerUsdtBalance(walletId: string): Promise<number> {
  return fetchWalletLedgerAssetBalance(walletId, "USDT");
}

