import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/system-action-logger";
import { getSmallBuysConfig } from "@/hooks/useSmallBuysSync";
import { fetchVerifiedNameMap, resolveClientId, captureVerifiedName, sanitizeNickname } from "@/lib/clientIdentityResolver";

/**
 * Fetch order detail from Binance API.
 * Returns { status, sellerRealName } or null on failure.
 */
async function fetchOrderDetail(orderNumber: string): Promise<{ status: string | null; sellerName: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('binance-ads', {
      body: { action: 'getOrderDetail', orderNumber },
    });
    if (error) return { status: null, sellerName: null };
    const apiResult = data?.data;
    const detail = apiResult?.data || apiResult;
    if (!detail) return { status: null, sellerName: null };

    // Map Binance numeric/string statuses to our string statuses
    const rawStatus = detail.orderStatus ?? detail.status ?? null;
    let status: string | null = null;
    if (rawStatus !== null && rawStatus !== undefined) {
      const numStatus = Number(rawStatus);
      if (!isNaN(numStatus)) {
        // Binance numeric: 0=pending, 1=paying, 2=buyer_paid, 3=distributing, 4=completed, 5=cancelled, 6=cancelled_by_system, 7=appeal
        const statusMap: Record<number, string> = {
          0: 'PENDING', 1: 'TRADING', 2: 'BUYER_PAYED',
          3: 'DISTRIBUTING', 4: 'COMPLETED', 5: 'CANCELLED',
          6: 'CANCELLED_BY_SYSTEM', 7: 'IN_APPEAL',
        };
        status = statusMap[numStatus] ?? String(rawStatus);
      } else {
        status = String(rawStatus);
      }
    }

    const sellerName = detail.sellerRealName || detail.sellerName || detail.sellerNickName || null;
    return { status, sellerName };
  } catch {
    return { status: null, sellerName: null };
  }
}

/**
 * Fetch Binance orders for a trade type + statuses with pagination.
 * Required because Supabase REST defaults to 1000 rows per request.
 */
async function fetchOrdersByStatus(
  tradeType: 'BUY' | 'SELL',
  statuses: string[],
  cutoffTime: number,
): Promise<any[]> {
  const PAGE_SIZE = 1000;
  const rows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('binance_order_history')
      .select('*')
      .eq('trade_type', tradeType)
      .in('order_status', statuses)
      .gte('create_time', cutoffTime)
      .order('create_time', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to fetch ${tradeType} orders: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

/**
 * Syncs completed BUY orders from binance_order_history to terminal_purchase_sync.
 * Also resolves IN_APPEAL orders by checking their live status from Binance API.
 * Called after the order sync completes or manually via "Sync Now" button.
 */
export async function syncCompletedBuyOrders(): Promise<{ synced: number; duplicates: number }> {
  let synced = 0;
  let duplicates = 0;

  // 1. Get the active terminal wallet link
  const { data: activeLink } = await supabase
    .from('terminal_wallet_links')
    .select('id, wallet_id, fee_treatment')
    .eq('status', 'active')
    .eq('platform_source', 'terminal')
    .limit(1)
    .maybeSingle();

  if (!activeLink) {
    throw new Error('No active terminal wallet link found. Please configure one in Stock Management → Wallet Linking.');
  }

  // Get wallet name
  const { data: walletInfo } = await supabase
    .from('wallets')
    .select('wallet_name')
    .eq('id', activeLink.wallet_id)
    .single();

  // 2. Look back 7 days to catch cross-day and appeal-resolved orders
  const LOOKBACK_DAYS = 7;
  const cutoffTime = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  // 2a. Fetch COMPLETED BUY orders (paginated)
  const completedBuys = await fetchOrdersByStatus('BUY', ['COMPLETED', '4'], cutoffTime);

  // 2b. Fetch IN_APPEAL BUY orders — these may have been resolved since last sync (paginated)
  const appealBuys = await fetchOrdersByStatus('BUY', ['IN_APPEAL', '7'], cutoffTime);


  // 2c. For each IN_APPEAL order, check live status from Binance API
  const resolvedAppealOrders: any[] = [];
  for (const order of (appealBuys || [])) {
    try {
      const { status, sellerName } = await fetchOrderDetail(order.order_number);

      if (status === 'COMPLETED') {
        const updatePayload: any = { order_status: 'COMPLETED' };
        if (sellerName && !order.verified_name) updatePayload.verified_name = sellerName;

        await supabase
          .from('binance_order_history')
          .update(updatePayload)
          .eq('order_number', order.order_number);

        resolvedAppealOrders.push({
          ...order,
          order_status: 'COMPLETED',
          verified_name: sellerName || order.verified_name,
        });
      }
    } catch (e) {
      console.warn(`[PurchaseSync] Failed to check appeal order ${order.order_number}:`, e);
    }
    // Rate limit protection
    await new Promise(r => setTimeout(r, 300));
  }

  // Combine all orders eligible for syncing
  let allEligible = [...(completedBuys || []), ...resolvedAppealOrders];

  // Exclude orders that fall within the small buys range
  const smallBuysConfig = await getSmallBuysConfig();
  if (smallBuysConfig?.is_enabled) {
    const before = allEligible.length;
    allEligible = allEligible.filter(o => {
      const tp = parseFloat(o.total_price || '0');
      return tp < smallBuysConfig.min_amount || tp > smallBuysConfig.max_amount;
    });
    const excluded = before - allEligible.length;
    if (excluded > 0) {
    }
  }

  if (allEligible.length === 0) {
    return { synced: 0, duplicates: 0 };
  }

  // 3. Get existing sync records to avoid duplicates (including rejected — never re-sync)
  const orderNumbers = allEligible.map(o => o.order_number);
  const { data: existingSyncs, error: existingSyncsErr } = await supabase
    .from('terminal_purchase_sync')
    .select('binance_order_number, sync_status')
    .in('binance_order_number', orderNumbers);

  if (existingSyncsErr) {
    throw new Error(`Failed to check existing syncs: ${existingSyncsErr.message}`);
  }

  const existingSet = new Set((existingSyncs || []).map(s => s.binance_order_number));

  // 4. Get PAN records — resolve unmasked nicknames from p2p_order_records first
  const getSafeCounterpartyKey = (value?: string | null) => {
    const normalized = (value || '').trim();
    if (!normalized || normalized.includes('*')) return null;
    return normalized;
  };

  // Fetch unmasked nicknames from p2p_order_records for orders with masked binance_order_history nicknames
  const { data: p2pNicknames } = await supabase
    .from('p2p_order_records')
    .select('binance_order_number, counterparty_nickname')
    .in('binance_order_number', orderNumbers);

  const p2pNicknameMap = new Map(
    (p2pNicknames || []).map(r => [r.binance_order_number, r.counterparty_nickname])
  );

  // Collect all safe nicknames — from both binance_order_history AND p2p_order_records (unmasked)
  const safeNicknames = [
    ...new Set([
      ...allEligible
        .map(o => getSafeCounterpartyKey(o.counter_part_nick_name))
        .filter((v): v is string => Boolean(v)),
      ...allEligible
        .map(o => getSafeCounterpartyKey(p2pNicknameMap.get(o.order_number)))
        .filter((v): v is string => Boolean(v)),
    ]),
  ];

  const { data: panRecords } = await supabase
    .from('counterparty_pan_records')
    .select('counterparty_nickname, pan_number')
    .in('counterparty_nickname', safeNicknames.length > 0 ? safeNicknames : ['__none__']);

  const panMap = new Map((panRecords || []).map(p => [p.counterparty_nickname, p.pan_number]));

    // 5. Cross-reference explicit client mappings from sales sync
    const { data: existingSalesMappings } = await supabase
      .from('terminal_sales_sync')
      .select('counterparty_name, client_id')
      .in('counterparty_name', safeNicknames.length > 0 ? safeNicknames : ['__none__'])
      .not('client_id', 'is', null);

    const salesClientMap = new Map(
      (existingSalesMappings || [])
        .filter(s => s.counterparty_name && s.client_id)
        .map(s => [s.counterparty_name!.toLowerCase().trim(), s.client_id!])
    );

    // 5b. Lookup client_binance_nicknames for auto-matching by nickname
    const { data: nicknameLinks } = await supabase
      .from('client_binance_nicknames')
      .select('nickname, client_id')
      .eq('is_active', true)
      .in('nickname', safeNicknames.length > 0 ? safeNicknames : ['__none__']);

    const nicknameClientMap = new Map(
      (nicknameLinks || []).map((l: any) => [l.nickname, l.client_id])
    );

    // 5c. Lookup client_verified_names for Priority 0 identity resolution
    const allVerifiedNames = [...new Set(
      allEligible
        .map(o => o.verified_name || null)
        .filter((v): v is string => Boolean(v) && v !== 'Unknown')
    )];
    const verifiedNameMap = await fetchVerifiedNameMap(allVerifiedNames);

    // 5d. Build client name map for Priority 3 fallback
    const { data: allClients } = await supabase
      .from('clients')
      .select('id, name')
      .eq('is_deleted', false);
    const clientNameMap = new Map<string, string>();
    for (const c of (allClients || [])) {
      clientNameMap.set(c.name.trim().toLowerCase(), c.id);
    }

    const userId = getCurrentUserId();

    // 6. Process each order — enrich verified names from Binance API
    //    Limit concurrent API calls to avoid hanging
    const toInsert: any[] = [];
    const newOrders = allEligible.filter(o => !existingSet.has(o.order_number));
    duplicates = allEligible.length - newOrders.length;

    for (const order of newOrders) {
      // Enrich: fetch verified seller name if not already available
      let verifiedName = order.verified_name || null;
      if (!verifiedName || verifiedName === order.counter_part_nick_name) {
        try {
          const { sellerName } = await fetchOrderDetail(order.order_number);
          if (sellerName) {
            verifiedName = sellerName;
            await supabase
              .from('binance_order_history')
              .update({ verified_name: sellerName })
              .eq('order_number', order.order_number);
          }
        } catch (e) {
          console.warn(`[PurchaseSync] Failed to enrich order ${order.order_number}:`, e);
        }
        await new Promise(r => setTimeout(r, 200));
      }

      const isMaskedNick = (order.counter_part_nick_name || '').includes('*');
      // NEVER use masked nickname as counterparty name — only verified names or unmasked nicknames
      const counterpartyName = verifiedName || (!isMaskedNick ? order.counter_part_nick_name : null) || 'Unknown';
      const safeNickname = getSafeCounterpartyKey(order.counter_part_nick_name);
      // Also try unmasked nickname from p2p_order_records (terminal uses this for PAN/contact storage)
      const unmaskedNickname = p2pNicknameMap.get(order.order_number) || null;
      const safeUnmasked = getSafeCounterpartyKey(unmaskedNickname);
      const pan = (safeNickname ? panMap.get(safeNickname) : null)
               || (safeUnmasked ? panMap.get(safeUnmasked) : null)
               || null;

      // Multi-signal identity resolution (verified name → nickname → intersection → name match)
      const resolved = resolveClientId({
        verifiedName,
        unmaskedNickname: safeUnmasked,
        safeNickname,
        counterpartyName,
        verifiedNameMap,
        nicknameClientMap,
        clientNameMap,
      });
      let clientId = resolved.clientId;
      const resolvedVia = resolved.resolvedVia;

      // Fallback: explicit sales sync mappings (purchase-specific cross-reference)
      if (!clientId && verifiedName) {
        clientId = salesClientMap.get(verifiedName.toLowerCase().trim()) || null;
      }
      if (!clientId && safeNickname) {
        clientId = salesClientMap.get(safeNickname.toLowerCase().trim()) || null;
      }
      if (!clientId && safeUnmasked) {
        clientId = salesClientMap.get(safeUnmasked.toLowerCase().trim()) || null;
      }

    const syncStatus = clientId ? 'synced_pending_approval' : 'client_mapping_pending';

    // Fallback: if primary fields are 0/null, extract from seller_payment_details._raw_detail
    const raw = order.seller_payment_details?._raw_detail || {};
    const amount = parseFloat(order.amount || '0') > 0 ? order.amount : (raw.amount || order.amount);
    const totalPrice = parseFloat(order.total_price || '0') > 0 ? order.total_price : (raw.totalPrice || order.total_price);
    const unitPrice = parseFloat(order.unit_price || '0') > 0 ? order.unit_price : (raw.price || order.unit_price);
    const commission = parseFloat(order.commission || '0') > 0 ? order.commission : (raw.commission || order.commission);
    const payMethod = order.pay_method_name || raw.payType || null;

    // Asset resolution: prefer raw_detail (direct from Binance API response) over cached DB field
    // This prevents wrong-asset entries when the DB cache has stale/default values
    const resolvedAsset = (raw.asset || order.asset || 'USDT').toUpperCase();

    toInsert.push({
      binance_order_number: order.order_number,
      sync_status: syncStatus,
      order_data: {
        order_number: order.order_number,
        asset: resolvedAsset,
        amount,
        total_price: totalPrice,
        unit_price: unitPrice,
        commission,
        counterparty_name: counterpartyName,
        counterparty_nickname: order.counter_part_nick_name,
        counterparty_nickname_unmasked: unmaskedNickname,
        verified_name: verifiedName,
        create_time: order.create_time,
        pay_method: payMethod,
        wallet_id: activeLink.wallet_id,
        wallet_name: walletInfo?.wallet_name || 'Terminal Wallet',
        fee_treatment: activeLink.fee_treatment,
        seller_payment_details: order.seller_payment_details || null,
      },
      client_id: clientId,
      counterparty_name: counterpartyName,
      pan_number: pan,
      synced_by: userId || null,
      synced_at: new Date().toISOString(),
      resolved_via: resolvedVia,
    });
  }

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from('terminal_purchase_sync')
      .insert(toInsert);
    if (insertErr) {
      console.error('[PurchaseSync] Insert error:', insertErr);
      throw new Error(`Failed to insert sync records: ${insertErr.message}`);
    }
    synced = toInsert.length;
  }

  // Auto-backfill: capture unmasked nicknames + verified names for matched clients
  for (const rec of toInsert) {
    if (!rec.client_id) continue;

    // Capture verified name into client_verified_names
    await captureVerifiedName(rec.client_id, rec.order_data?.verified_name, 'auto_sync');

    const unmasked = rec.order_data?.counterparty_nickname_unmasked;
    const safeNick = rec.order_data?.counterparty_nickname;
    const nicksToCapture = [
      unmasked && !unmasked.includes('*') ? unmasked : null,
      safeNick && !safeNick.includes('*') ? safeNick : null,
    ].filter(Boolean) as string[];

    for (const nick of nicksToCapture) {
      if (nicknameClientMap.has(nick)) continue; // Already linked
      try {
        await supabase.from('client_binance_nicknames').upsert({
          client_id: rec.client_id,
          nickname: nick,
          source: 'auto_sync',
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'nickname' });
      } catch { /* best effort */ }
    }
  }

  return { synced, duplicates };
}
