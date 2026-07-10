import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/system-action-logger";
import { getSmallBuysConfig } from "@/hooks/useSmallBuysSync";
import { sanitizeNickname, extractCounterpartyUserNo, resolveOrderUserNo } from "@/lib/clientIdentityResolver";

/** Max on-demand userNo fetches per sync run (protects Binance rate limits). */
const MAX_ONDEMAND_USERNO = 60;

/**
 * Fetch order detail from Binance API.
 * Returns { status, sellerRealName } or null on failure.
 */
function extractSellerNameFromDetail(detail: any): string | null {
  const direct = detail?.sellerRealName || detail?.sellerName || detail?.sellerNickName || null;
  if (direct) return String(direct).trim();
  const methods = Array.isArray(detail?.payMethods) ? detail.payMethods : Array.isArray(detail?.tradeMethods) ? detail.tradeMethods : [];
  for (const method of methods) {
    const fields = Array.isArray(method?.fields) ? method.fields : [];
    const payee = fields.find((field: any) => String(field?.fieldContentType || '').toLowerCase() === 'payee' && String(field?.fieldValue || '').trim());
    if (payee) return String(payee.fieldValue).trim();
  }
  return null;
}

async function fetchOrderDetail(orderNumber: string, exchangeAccountId?: string | null): Promise<{ status: string | null; sellerName: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('binance-ads', {
      body: { action: 'getOrderDetail', orderNumber, exchange_account_id: exchangeAccountId },
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
        const statusMap: Record<number, string> = {
          0: 'PENDING', 1: 'TRADING', 2: 'BUYER_PAYED',
          3: 'DISTRIBUTING', 4: 'COMPLETED', 5: 'IN_APPEAL',
          6: 'CANCELLED', 7: 'CANCELLED_BY_SYSTEM', 8: 'IN_APPEAL',
        };
        status = statusMap[numStatus] ?? String(rawStatus);
      } else {
        status = String(rawStatus);
      }
    }

    const sellerName = extractSellerNameFromDetail(detail);
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
 *
 * Client attribution is STRICTLY by Binance userNo (the stable, globally-unique
 * account id). Nickname / verified-KYC-name matching has been removed — those
 * are not globally unique and caused cross-contamination. Nicknames/verified
 * names/PAN are still stored for DISPLAY only.
 */
export async function syncCompletedBuyOrders(): Promise<{ synced: number; duplicates: number }> {
  let synced = 0;
  let duplicates = 0;

  // 1. Get all active terminal wallet links, mapped per exchange account
  const { data: allLinks } = await supabase
    .from('terminal_wallet_links')
    .select('id, wallet_id, fee_treatment, exchange_account_id')
    .eq('status', 'active')
    .eq('platform_source', 'terminal');

  if (!allLinks || allLinks.length === 0) {
    throw new Error('No active terminal wallet link found. Please configure one in Stock Management → Wallet Linking.');
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
      const { status, sellerName } = await fetchOrderDetail(order.order_number, (order as any).exchange_account_id || null);

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
    await new Promise(r => setTimeout(r, 300));
  }

  // Combine all orders eligible for syncing
  let allEligible = [...(completedBuys || []), ...resolvedAppealOrders];

  // Exclude orders that fall within the small buys range
  const smallBuysConfig = await getSmallBuysConfig();
  if (smallBuysConfig?.is_enabled) {
    allEligible = allEligible.filter(o => {
      const tp = parseFloat(o.total_price || '0');
      return tp < smallBuysConfig.min_amount || tp > smallBuysConfig.max_amount;
    });
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

  // 4. PAN records (DISPLAY only) — resolve unmasked nicknames from p2p_order_records first
  const getSafeCounterpartyKey = (value?: string | null) => sanitizeNickname(value);

  const { data: p2pNicknames } = await supabase
    .from('p2p_order_records')
    .select('binance_order_number, counterparty_nickname')
    .in('binance_order_number', orderNumbers);

  const p2pNicknameMap = new Map(
    (p2pNicknames || []).map(r => [r.binance_order_number, r.counterparty_nickname])
  );

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

  const userId = getCurrentUserId();
  const newOrders = allEligible.filter(o => !existingSet.has(o.order_number));
  duplicates = allEligible.length - newOrders.length;

  // 5. === userNo-ONLY client resolution ===
  // 5a. Cached userNos for these orders from cp_order_identity.
  const newOrderNumbers = newOrders.map(o => o.order_number);
  const { data: coiRows } = await supabase
    .from('cp_order_identity')
    .select('order_number, cp_userno')
    .in('order_number', newOrderNumbers.length > 0 ? newOrderNumbers : ['__none__']);
  const cachedUserNo = new Map<string, string>();
  for (const r of coiRows || []) {
    if (r.cp_userno) cachedUserNo.set(r.order_number, String(r.cp_userno));
  }

  // 5b. Determine cpUserNo per new order (cache → order_detail_raw).
  const orderUserNo = new Map<string, string>();
  for (const order of newOrders) {
    let uno = cachedUserNo.get(order.order_number) || null;
    if (!uno && order.order_detail_raw) {
      uno = extractCounterpartyUserNo(order.order_detail_raw, 'BUY');
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

  let onDemandBudget = MAX_ONDEMAND_USERNO;

  // 6. Process each order
  const toInsert: any[] = [];
  for (const order of newOrders) {
    const orderAccountId = (order as any).exchange_account_id || null;

    // ---- userNo resolution ----
    let cpUserNo = orderUserNo.get(order.order_number) || null;
    let clientId: string | null = cpUserNo ? (userNoClientMap.get(cpUserNo)?.id ?? null) : null;

    if (!cpUserNo && onDemandBudget > 0) {
      onDemandBudget--;
      const res = await resolveOrderUserNo({
        orderNumber: order.order_number,
        tradeType: 'BUY',
        exchangeAccountId: orderAccountId,
      });
      if (res.cpUserNo) {
        cpUserNo = res.cpUserNo;
        clientId = res.clientId ?? (userNoClientMap.get(res.cpUserNo)?.id ?? null);
      }
      await new Promise(r => setTimeout(r, 200));
    }

    // ---- display-only enrichment (verified seller name for readability) ----
    let verifiedName = order.verified_name || null;
    if (!verifiedName || verifiedName === order.counter_part_nick_name) {
      try {
        const { sellerName } = await fetchOrderDetail(order.order_number, orderAccountId);
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
    const counterpartyName = verifiedName || (!isMaskedNick ? order.counter_part_nick_name : null) || 'Unknown';
    const safeNickname = getSafeCounterpartyKey(order.counter_part_nick_name);
    const unmaskedNickname = p2pNicknameMap.get(order.order_number) || null;
    const safeUnmasked = getSafeCounterpartyKey(unmaskedNickname);
    const pan = (safeNickname ? panMap.get(safeNickname) : null)
             || (safeUnmasked ? panMap.get(safeUnmasked) : null)
             || null;

    // Auto-link ONLY when userNo maps to an existing client. Otherwise the
    // operator must confirm/create the client manually (no name matching).
    const syncStatus = clientId ? 'synced_pending_approval' : 'client_mapping_pending';

    // Fallback: if primary fields are 0/null, extract from seller_payment_details._raw_detail
    const raw = order.seller_payment_details?._raw_detail || {};
    const amount = parseFloat(order.amount || '0') > 0 ? order.amount : (raw.amount || order.amount);
    const totalPrice = parseFloat(order.total_price || '0') > 0 ? order.total_price : (raw.totalPrice || order.total_price);
    const unitPrice = parseFloat(order.unit_price || '0') > 0 ? order.unit_price : (raw.price || order.unit_price);
    const commission = parseFloat(order.commission || '0') > 0 ? order.commission : (raw.commission || order.commission);
    const payMethod = order.pay_method_name || raw.payType || null;

    const resolvedAsset = (raw.asset || order.asset || 'USDT').toUpperCase();

    const link = resolveLink(orderAccountId);

    toInsert.push({
      binance_order_number: order.order_number,
      sync_status: syncStatus,
      exchange_account_id: orderAccountId || link.exchange_account_id || null,
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
        cp_userno: cpUserNo,
        create_time: order.create_time,
        pay_method: payMethod,
        wallet_id: link.wallet_id,
        wallet_name: walletNameById.get(link.wallet_id) || 'Terminal Wallet',
        fee_treatment: link.fee_treatment,
        seller_payment_details: order.seller_payment_details || null,
      },
      client_id: clientId,
      counterparty_name: counterpartyName,
      pan_number: pan,
      synced_by: userId || null,
      synced_at: new Date().toISOString(),
      resolved_via: cpUserNo ? 'userno' : null,
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

  return { synced, duplicates };
}
