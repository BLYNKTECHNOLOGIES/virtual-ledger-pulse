import { supabase } from "@/integrations/supabase/client";
import { fetchCoinMarketRate } from "@/hooks/useCoinMarketRate";

/**
 * Locked market rate — immutable once fetched.
 * Used as the single source of truth for all USDT-equivalent computations.
 */
export interface LockedMarketRate {
  price: number;
  source: string;
  timestamp: Date;
  snapshotId?: string;
}

/**
 * Computed effective USDT valuation for a transaction.
 */
export interface EffectiveUsdtValuation {
  marketRateUsdt: number;
  effectiveUsdtQty: number;
  effectiveUsdtRate: number | null;
  priceSnapshotId: string | null;
}

/**
 * Fetches and locks a market rate for a given asset code.
 * If the price is 0 or unavailable, throws an error (blocking the entry)
 * unless allowManualOverride is set and a manualPrice is provided.
 */
export async function fetchAndLockMarketRate(
  assetCode: string,
  options?: {
    entryType?: string;
    referenceId?: string;
    referenceType?: string;
    requestedBy?: string;
    allowManualOverride?: boolean;
    manualPrice?: number;
  }
): Promise<LockedMarketRate> {
  const code = assetCode?.toUpperCase() || 'USDT';

  // USDT is always 1:1
  if (code === 'USDT') {
    const snapshot = await persistPriceSnapshot({
      assetCode: 'USDT',
      usdtPrice: 1.0,
      source: 'Static',
      entryType: options?.entryType,
      referenceId: options?.referenceId,
      referenceType: options?.referenceType,
      requestedBy: options?.requestedBy,
    });
    return { price: 1.0, source: 'Static', timestamp: new Date(), snapshotId: snapshot?.id };
  }

  // Attempt live fetch
  const livePrice = await fetchCoinMarketRate(code);

  if (livePrice > 0) {
    const snapshot = await persistPriceSnapshot({
      assetCode: code,
      usdtPrice: livePrice,
      source: 'Binance',
      entryType: options?.entryType,
      referenceId: options?.referenceId,
      referenceType: options?.referenceType,
      requestedBy: options?.requestedBy,
    });
    return { price: livePrice, source: 'Binance', timestamp: new Date(), snapshotId: snapshot?.id };
  }

  // Price unavailable — check manual override
  if (options?.allowManualOverride && options?.manualPrice && options.manualPrice > 0) {
    const snapshot = await persistPriceSnapshot({
      assetCode: code,
      usdtPrice: options.manualPrice,
      source: 'Manual',
      entryType: options?.entryType,
      referenceId: options?.referenceId,
      referenceType: options?.referenceType,
      requestedBy: options?.requestedBy,
    });
    return { price: options.manualPrice, source: 'Manual', timestamp: new Date(), snapshotId: snapshot?.id };
  }

  // Block entry — no price available
  throw new Error(`Market price unavailable for ${code}. Cannot proceed without a valid USDT rate.`);
}

/**
 * Persist a price snapshot for audit trail.
 */
async function persistPriceSnapshot(params: {
  assetCode: string;
  usdtPrice: number;
  source: string;
  entryType?: string;
  referenceId?: string;
  referenceType?: string;
  requestedBy?: string;
}): Promise<{ id: string } | null> {
  try {
    const { data, error } = await supabase
      .from('price_snapshots' as any)
      .insert({
        asset_code: params.assetCode,
        usdt_price: params.usdtPrice,
        source: params.source,
        entry_type: params.entryType || null,
        reference_id: params.referenceId || null,
        reference_type: params.referenceType || null,
        requested_by: params.requestedBy || null,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[persistPriceSnapshot] Failed to persist:', error.message);
      return null;
    }
    return data as any;
  } catch (err) {
    console.warn('[persistPriceSnapshot] Error:', err);
    return null;
  }
}

/**
 * Compute effective USDT valuation for any transaction.
 *
 * @param assetQty     - Raw quantity of the asset
 * @param inrValue     - Total INR (or base currency) value of the transaction
 * @param assetCode    - Asset code (BTC, ETH, USDT, etc.)
 * @param entryType    - Type of entry for audit
 * @param requestedBy  - User ID who triggered the computation
 */
export async function computeEffectiveUsdt(
  assetQty: number,
  inrValue: number,
  assetCode: string,
  entryType?: string,
  requestedBy?: string,
): Promise<EffectiveUsdtValuation> {
  const locked = await fetchAndLockMarketRate(assetCode, {
    entryType,
    requestedBy,
  });

  const effectiveUsdtQty = assetQty * locked.price;
  const effectiveUsdtRate = effectiveUsdtQty > 0 ? inrValue / effectiveUsdtQty : null;

  return {
    marketRateUsdt: locked.price,
    effectiveUsdtQty,
    effectiveUsdtRate,
    priceSnapshotId: locked.snapshotId || null,
  };
}

/**
 * Update the price snapshot with the reference (order/transaction) ID after creation.
 */
export async function linkSnapshotToReference(
  snapshotId: string,
  referenceId: string,
  referenceType: string,
): Promise<void> {
  if (!snapshotId) return;
  try {
    await supabase
      .from('price_snapshots' as any)
      .update({ reference_id: referenceId, reference_type: referenceType })
      .eq('id', snapshotId);
  } catch (err) {
    console.warn('[linkSnapshotToReference] Failed:', err);
  }
}

/**
 * Insert a batch USDT valuation record for small order approvals.
 */
export async function persistBatchValuation(params: {
  batchId: string;
  batchType: 'small_buys' | 'small_sales';
  assetCode: string;
  totalInrValue: number;
  totalAssetQty: number;
  marketRateUsdt: number;
  aggregatedUsdtQty: number;
  effectiveUsdtRate: number | null;
  orderId?: string;
  priceSnapshotId?: string;
  createdBy?: string;
}): Promise<void> {
  try {
    await supabase
      .from('batch_usdt_valuations' as any)
      .insert({
        batch_id: params.batchId,
        batch_type: params.batchType,
        asset_code: params.assetCode,
        total_inr_value: params.totalInrValue,
        total_asset_qty: params.totalAssetQty,
        market_rate_usdt: params.marketRateUsdt,
        aggregated_usdt_qty: params.aggregatedUsdtQty,
        effective_usdt_rate: params.effectiveUsdtRate,
        order_id: params.orderId || null,
        price_snapshot_id: params.priceSnapshotId || null,
        created_by: params.createdBy || null,
      });
  } catch (err) {
    console.warn('[persistBatchValuation] Failed:', err);
  }
}
