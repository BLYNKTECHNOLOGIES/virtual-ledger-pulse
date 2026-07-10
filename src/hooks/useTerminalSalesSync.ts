import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/system-action-logger";
import { getSmallSalesConfig } from "@/hooks/useSmallSalesSync";
import { extractCounterpartyUserNo, resolveOrderUserNo } from "@/lib/clientIdentityResolver";

/** Max on-demand userNo fetches per sync run (protects Binance rate limits). */
const MAX_ONDEMAND_USERNO = 60;

/**
 * Fetch verified buyer name from Binance order detail API — DISPLAY ONLY.
 * Never used to match a client; matching is strictly by Binance userNo.
 */
async function fetchVerifiedBuyerName(orderNumber: string, exchangeAccountId?: string | null): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('binance-ads', {
      body: { action: 'getOrderDetail', orderNumber, exchange_account_id: exchangeAccountId },
    });
    if (error) return null;
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
 *
 * Client attribution is STRICTLY by Binance userNo (the stable, globally-unique
 * account id). Nickname / verified-KYC-name matching has been removed — those
 * are not globally unique and caused cross-contamination. Nicknames/verified
 * names are still stored in order_data for DISPLAY only.
 */
export async function syncCompletedSellOrders(): Promise<{ synced: number; duplicates: number }> {
  let synced = 0;
  let duplicates = 0;

  try {
    // 1. Get all active terminal wallet links, mapped per exchange account
    const { data: allLinks } = await supabase
      .from('terminal_wallet_links')
      .select('id, wallet_id, fee_treatment, exchange_account_id')
      .eq('status', 'active')
      .eq('platform_source', 'terminal');

    if (!allLinks || allLinks.length === 0) {
      return { synced: 0, duplicates: 0 };
    }

    const linkByAccount = new Map<string, typeof allLinks[number]>();
    let fallbackLink: typeof allLinks[number] | null = null;
    for (const l of allLinks) {
      if (l.exchange_account_id) linkByAccount.set(l.exchange_account_id, l);
      else if (!fallbackLink) fallbackLink = l;
    }
    if (!fallbackLink) fallbackLink = allLinks[0];
    const resolveLink = (accId: string | null | undefined) =>
      (accId && linkByAccount.get(accId)) || fallbackLink!;

    // Wallet name lookup for all linked wallets
    const { data: walletRows } = await supabase
      .from('wallets')
      .select('id, wallet_name')
      .in('id', allLinks.map((l) => l.wallet_id));
    const walletNameById = new Map<string, string>((walletRows || []).map((w) => [w.id, w.wallet_name]));

    // 2. Get completed SELL orders from binance_order_history — last 7 days to catch cross-day orders
    const cutoffTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
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

    // 3. Get existing sync records to check duplicates
    const orderNumbers = filteredSells.map(o => o.order_number);
    const { data: existingSyncs } = await supabase
      .from('terminal_sales_sync')
      .select('id, binance_order_number, sync_status, sales_order_id')
      .in('binance_order_number', orderNumbers);

    const existingSet = new Set((existingSyncs || []).map((s: any) => s.binance_order_number));

    // 3b. Fetch unmasked nicknames from p2p_order_records (DISPLAY ONLY)
    const { data: p2pNicknames } = await supabase
      .from('p2p_order_records')
      .select('binance_order_number, counterparty_nickname')
      .in('binance_order_number', orderNumbers);

    const p2pNicknameMap = new Map(
      (p2pNicknames || []).map((r: any) => [r.binance_order_number, r.counterparty_nickname])
    );

    // 4. Contact records for display (contact number / state) keyed by nickname
    const allSafeNicknames = [...new Set(
      filteredSells
        .flatMap(o => [o.counter_part_nick_name, p2pNicknameMap.get(o.order_number)])
        .filter(Boolean)
        .filter((n: string) => !n.includes('*'))
    )];

    const { data: contactRecords } = await supabase
      .from('counterparty_contact_records')
      .select('counterparty_nickname, contact_number, state')
      .in('counterparty_nickname', allSafeNicknames.length > 0 ? allSafeNicknames : ['__none__']);

    const contactMap = new Map((contactRecords || []).map(c => [c.counterparty_nickname, c]));

    // 5. === userNo-ONLY client resolution ===
    // 5a. Cached userNos for these orders from cp_order_identity.
    const { data: coiRows } = await supabase
      .from('cp_order_identity')
      .select('order_number, cp_userno')
      .in('order_number', orderNumbers.length > 0 ? orderNumbers : ['__none__']);
    const cachedUserNo = new Map<string, string>();
    for (const r of coiRows || []) {
      if (r.cp_userno) cachedUserNo.set(r.order_number, String(r.cp_userno));
    }

    // 5b. For each new order, determine cpUserNo (cache → order_detail_raw).
    const newOrders = filteredSells.filter(o => !existingSet.has(o.order_number));
    const orderUserNo = new Map<string, string>();
    for (const order of newOrders) {
      let uno = cachedUserNo.get(order.order_number) || null;
      if (!uno && order.order_detail_raw) {
        uno = extractCounterpartyUserNo(order.order_detail_raw, 'SELL');
      }
      if (uno) orderUserNo.set(order.order_number, String(uno));
    }

    // 5c. Resolve all known userNos → client in one query.
    const knownUserNos = [...new Set([...orderUserNo.values()])];
    const userNoClientMap = new Map<string, { id: string; name: string | null }>();
    if (knownUserNos.length > 0) {
      const { data: unoRows } = await supabase
        .from('client_binance_usernos')
        .select('cp_userno, client_id, clients!inner(id, name, is_deleted)')
        .eq('is_active', true)
        .in('cp_userno', knownUserNos);
      for (const r of unoRows || []) {
        const c = (r as any).clients;
        if (c && !c.is_deleted) userNoClientMap.set(String((r as any).cp_userno), { id: c.id, name: c.name });
      }
    }

    const userId = getCurrentUserId();
    let onDemandBudget = MAX_ONDEMAND_USERNO;

    // 6. Process each order
    const toInsert: any[] = [];
    for (const order of filteredSells) {
      if (existingSet.has(order.order_number)) {
        duplicates++;
        continue;
      }

      const orderAccountId = (order as any).exchange_account_id || null;

      // ---- userNo resolution ----
      let cpUserNo = orderUserNo.get(order.order_number) || null;
      let clientId: string | null = cpUserNo ? (userNoClientMap.get(cpUserNo)?.id ?? null) : null;

      // On-demand fetch when userNo still unknown (bounded per run).
      if (!cpUserNo && onDemandBudget > 0) {
        onDemandBudget--;
        const res = await resolveOrderUserNo({
          orderNumber: order.order_number,
          tradeType: 'SELL',
          exchangeAccountId: orderAccountId,
        });
        if (res.cpUserNo) {
          cpUserNo = res.cpUserNo;
          clientId = res.clientId ?? (userNoClientMap.get(res.cpUserNo)?.id ?? null);
        }
        await new Promise(r => setTimeout(r, 200));
      }

      // ---- display-only enrichment (verified name for readability) ----
      let verifiedName = order.verified_name || null;
      if (!verifiedName || verifiedName === order.counter_part_nick_name) {
        const fetched = await fetchVerifiedBuyerName(order.order_number, orderAccountId);
        if (fetched) {
          verifiedName = fetched;
          await supabase
            .from('binance_order_history')
            .update({ verified_name: fetched })
            .eq('order_number', order.order_number);
        }
        await new Promise(r => setTimeout(r, 200));
      }

      const isMaskedNick = (order.counter_part_nick_name || '').includes('*');
      const counterpartyName = verifiedName || (!isMaskedNick ? order.counter_part_nick_name : null) || 'Unknown';
      const contact = contactMap.get(order.counter_part_nick_name || '') || null;
      const unmaskedNickname = p2pNicknameMap.get(order.order_number) || null;

      // Auto-link ONLY when userNo maps to an existing client. Otherwise the
      // operator must confirm/create the client manually (no name matching).
      const syncStatus = clientId ? 'synced_pending_approval' : 'client_mapping_pending';

      const link = resolveLink(orderAccountId);

      toInsert.push({
        binance_order_number: order.order_number,
        sync_status: syncStatus,
        exchange_account_id: orderAccountId || link.exchange_account_id || null,
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
          cp_userno: cpUserNo,
          create_time: order.create_time,
          pay_method: order.pay_method_name,
          wallet_id: link.wallet_id,
          wallet_name: walletNameById.get(link.wallet_id) || 'Terminal Wallet',
          fee_treatment: link.fee_treatment,
        },
        client_id: clientId,
        counterparty_name: counterpartyName,
        contact_number: contact?.contact_number || null,
        state: contact?.state || null,
        synced_by: userId || null,
        synced_at: new Date().toISOString(),
        resolved_via: cpUserNo ? 'userno' : null,
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
  } catch (err) {
    console.error('[SalesSync] Error:', err);
  }

  return { synced, duplicates };
}
