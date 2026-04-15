import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/system-action-logger";
import { getSmallSalesConfig } from "@/hooks/useSmallSalesSync";
import { fetchVerifiedNameMap, resolveClientId, captureVerifiedName } from "@/lib/clientIdentityResolver";

/**
 * Fetch verified buyer name from Binance order detail API.
 * Returns the real name or null if unavailable.
 */
async function fetchVerifiedBuyerName(orderNumber: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('binance-ads', {
      body: { action: 'getOrderDetail', orderNumber },
    });
    if (error) return null;
    // The response structure: data.data.buyerRealName or data.data.sellerRealName
    const apiResult = data?.data;
    const detail = apiResult?.data || apiResult;
    if (!detail) return null;
    // For SELL orders, we are the seller – the counterparty is the buyer
    return detail.buyerRealName || detail.buyerName || detail.buyerNickName || null;
  } catch {
    return null;
  }
}

/**
 * Fetch Binance orders for a trade type + statuses with pagination.
 * Required because Supabase REST defaults to 1000 rows per request.
 */
async function fetchSalesOrdersByStatus(statuses: string[], cutoffTime: number): Promise<any[]> {
  const PAGE_SIZE = 1000;
  const rows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('binance_order_history')
      .select('*')
      .eq('trade_type', 'SELL')
      .in('order_status', statuses)
      .gte('create_time', cutoffTime)
      .order('create_time', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

/**
 * Syncs completed SELL orders from binance_order_history to terminal_sales_sync.
 * Called after the order sync completes (alongside purchase sync).
 */
export async function syncCompletedSellOrders(): Promise<{ synced: number; duplicates: number }> {
  let synced = 0;
  let duplicates = 0;

  try {
    // 1. Get the active terminal wallet link
    const { data: activeLink } = await supabase
      .from('terminal_wallet_links')
      .select('id, wallet_id, fee_treatment')
      .eq('status', 'active')
      .eq('platform_source', 'terminal')
      .limit(1)
      .maybeSingle();

    if (!activeLink) {
      return { synced: 0, duplicates: 0 };
    }

    // Get wallet name
    const { data: walletInfo } = await supabase
      .from('wallets')
      .select('wallet_name')
      .eq('id', activeLink.wallet_id)
      .single();

    // 2. Get completed SELL orders from binance_order_history — last 7 days to catch cross-day orders
    // (orders created yesterday but completed/appeal-resolved today)
    const cutoffTime = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago in epoch ms
    const completedSells = await fetchSalesOrdersByStatus(['COMPLETED', '4'], cutoffTime);

    if (!completedSells || completedSells.length === 0) {
      return { synced: 0, duplicates: 0 };
    }

    // Exclude orders that fall in the small sales range (if enabled)
    const smallConfig = await getSmallSalesConfig();
    let filteredSells = completedSells;
    if (smallConfig?.is_enabled) {
      filteredSells = completedSells.filter(o => {
        const tp = parseFloat(o.total_price || '0');
        return tp < smallConfig.min_amount || tp > smallConfig.max_amount;
      });
      if (filteredSells.length === 0) {
        return { synced: 0, duplicates: 0 };
      }
    }

    // 3. Get existing sync records to check duplicates AND detect broken historical links
    const orderNumbers = filteredSells.map(o => o.order_number);
    const { data: existingSyncs } = await supabase
      .from('terminal_sales_sync')
      .select('id, binance_order_number, sync_status, sales_order_id')
      .in('binance_order_number', orderNumbers);

    // NOTE: Auto-heal logic was removed — it was aggressively resetting approved sync records
    // back to pending when terminal_sync_id didn't match, causing 276+ records to lose their
    // approved status. The mismatch was benign (different sync flows creating the sales order)
    // and did not indicate actual data corruption.

    const existingSet = new Set((existingSyncs || []).map((s: any) => s.binance_order_number));

    // 3b. Fetch unmasked nicknames from p2p_order_records
    const { data: p2pNicknames } = await supabase
      .from('p2p_order_records')
      .select('binance_order_number, counterparty_nickname')
      .in('binance_order_number', orderNumbers);

    const p2pNicknameMap = new Map(
      (p2pNicknames || []).map((r: any) => [r.binance_order_number, r.counterparty_nickname])
    );

    // 4. Get contact records for counterparties
    // Filter out masked nicknames (containing *) to prevent cross-contamination of contact data
    const nicknames = [...new Set(
      filteredSells
        .map(o => o.counter_part_nick_name)
        .filter(Boolean)
        .filter((n: string) => !n.includes('*'))
    )];
    // Also collect unmasked nicknames from p2p_order_records
    const unmaskedNicks = [...new Set(
      filteredSells
        .map(o => p2pNicknameMap.get(o.order_number))
        .filter(Boolean)
        .filter((n: string) => !n.includes('*'))
    )];
    const allSafeNicknames = [...new Set([...nicknames, ...unmaskedNicks])];

    const { data: contactRecords } = await supabase
      .from('counterparty_contact_records')
      .select('counterparty_nickname, contact_number, state')
      .in('counterparty_nickname', allSafeNicknames.length > 0 ? allSafeNicknames : ['__none__']);

    const contactMap = new Map((contactRecords || []).map(c => [c.counterparty_nickname, c]));

    // 4b. Lookup client_binance_nicknames for auto-matching by nickname
    const { data: nicknameLinks } = await supabase
      .from('client_binance_nicknames')
      .select('nickname, client_id')
      .eq('is_active', true)
      .in('nickname', allSafeNicknames.length > 0 ? allSafeNicknames : ['__none__']);

    const nicknameClientMap = new Map(
      (nicknameLinks || []).map((l: any) => [l.nickname, l.client_id])
    );

    // 4c. Lookup client_verified_names for Priority 0 identity resolution
    const allVerifiedNames = [...new Set(
      filteredSells
        .map(o => o.verified_name || null)
        .filter((v): v is string => Boolean(v) && v !== 'Unknown')
    )];
    const verifiedNameMap = await fetchVerifiedNameMap(allVerifiedNames);

    // 5. Try to match clients — use case-insensitive matching to prevent duplicates
    const { data: matchedClients } = await supabase
      .from('clients')
      .select('id, name')
      .eq('is_deleted', false);

    // Build case-insensitive name→id map from ALL non-deleted clients
    const clientMap = new Map<string, string>();
    for (const c of (matchedClients || [])) {
      clientMap.set(c.name.trim().toLowerCase(), c.id);
    }

    const userId = getCurrentUserId();

    // 6. Process each order
    const toInsert: any[] = [];
    for (const order of filteredSells) {
      if (existingSet.has(order.order_number)) {
        duplicates++;
        continue;
      }

      // Enrich: fetch verified buyer name from order detail API
      let verifiedName = order.verified_name || null;
      if (!verifiedName || verifiedName === order.counter_part_nick_name) {
        const fetched = await fetchVerifiedBuyerName(order.order_number);
        if (fetched) {
          verifiedName = fetched;
          // Persist verified name back to binance_order_history (parity with purchase sync)
          await supabase
            .from('binance_order_history')
            .update({ verified_name: fetched })
            .eq('order_number', order.order_number);
        }
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 200));
      }

      const isMaskedNick = (order.counter_part_nick_name || '').includes('*');
      // NEVER use masked nickname as counterparty name — only verified names or unmasked nicknames
      const counterpartyName = verifiedName || (!isMaskedNick ? order.counter_part_nick_name : null) || 'Unknown';
      const contact = contactMap.get(order.counter_part_nick_name || '') || null;

      // Resolve unmasked nickname from p2p_order_records
      const unmaskedNickname = p2pNicknameMap.get(order.order_number) || null;
      const safeUnmasked = unmaskedNickname && !unmaskedNickname.includes('*') ? unmaskedNickname : null;
      const safeNick = !isMaskedNick ? order.counter_part_nick_name : null;

      // Multi-signal identity resolution
      // If we just fetched a new verified name, add it to the map for resolution
      if (verifiedName && !verifiedNameMap.has(verifiedName)) {
        // New verified name not yet in DB — won't match, but that's correct
      }
      const resolved = resolveClientId({
        verifiedName,
        unmaskedNickname: safeUnmasked,
        safeNickname: safeNick,
        counterpartyName,
        verifiedNameMap,
        nicknameClientMap,
        clientNameMap: clientMap,
      });
      const clientId = resolved.clientId;

      // Force manual mapping if we couldn't resolve a real name
      const syncStatus = (counterpartyName === 'Unknown') ? 'client_mapping_pending' : (clientId ? 'synced_pending_approval' : 'client_mapping_pending');

      toInsert.push({
        binance_order_number: order.order_number,
        sync_status: syncStatus,
        order_data: {
          order_number: order.order_number,
          asset: ((order.seller_payment_details as any)?._raw_detail?.asset || order.asset || 'USDT').toUpperCase(),
          amount: order.amount,
          total_price: order.total_price,
          unit_price: order.unit_price,
          commission: order.commission,
          counterparty_name: counterpartyName,
          counterparty_nickname: order.counter_part_nick_name,
          counterparty_nickname_unmasked: unmaskedNickname,
          verified_name: verifiedName,
          create_time: order.create_time,
          pay_method: order.pay_method_name,
          wallet_id: activeLink.wallet_id,
          wallet_name: walletInfo?.wallet_name || 'Terminal Wallet',
          fee_treatment: activeLink.fee_treatment,
        },
        client_id: clientId,
        counterparty_name: counterpartyName,
        contact_number: contact?.contact_number || null,
        state: contact?.state || null,
        synced_by: userId || null,
        synced_at: new Date().toISOString(),
      });
    }

    if (toInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from('terminal_sales_sync')
        .insert(toInsert);
      if (insertErr) {
        console.error('[SalesSync] Insert error:', insertErr);
        throw insertErr;
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

  } catch (err) {
    console.error('[SalesSync] Error:', err);
  }

  return { synced, duplicates };
}
