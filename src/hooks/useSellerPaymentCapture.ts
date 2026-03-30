import { supabase } from "@/integrations/supabase/client";

/**
 * Captures seller payment details (bank account, IFSC, name) from the Binance
 * getUserOrderDetail endpoint while orders are still active (TRADING, BUYER_PAYED).
 * 
 * Once an order completes, Binance strips payment method details from the response,
 * so we must capture this data proactively while the order is live.
 */

const ACTIVE_STATUSES = ['PENDING', 'TRADING', 'BUYER_PAYED', 'DISTRIBUTING'];

interface SellerPaymentInfo {
  accountNo?: string;
  accountName?: string;
  bankName?: string;
  ifscCode?: string;
  accountType?: string;
  accountOpeningBranch?: string;
  payType?: string;
  identifier?: string;
  rawMethods?: any[];
}

/**
 * Extract seller payment details from the getUserOrderDetail response.
 * The Binance API returns payment info in various field names depending on trade type.
 */
function extractSellerPaymentDetails(detail: any): SellerPaymentInfo | null {
  // Look for payment method arrays in known field names
  const methodArrays = [
    detail.tradeMethods,
    detail.tradeMethodList,
    detail.sellerPaymentMethodList,
    detail.payMethods,
    detail.payMethodList,
    detail.sellerMethods,
  ].filter(Boolean);

  // Also check nested data structure
  if (detail.data) {
    const nested = detail.data;
    methodArrays.push(
      nested.tradeMethods,
      nested.tradeMethodList,
      nested.sellerPaymentMethodList,
      nested.payMethods,
    );
  }

  const methods = methodArrays.find(arr => Array.isArray(arr) && arr.length > 0);

  const findFieldValue = (fields: any[], predicate: (field: any) => boolean): string => {
    const field = fields.find((f) => {
      const val = String(f?.fieldValue || '').trim();
      return val && predicate(f);
    });
    return String(field?.fieldValue || '').trim();
  };

  if (!methods || methods.length === 0) {
    // Check for flat payment fields
    if (detail.payAccountNo || detail.payeeAccountNo || detail.sellerAccountNo) {
      return {
        accountNo: detail.payAccountNo || detail.payeeAccountNo || detail.sellerAccountNo || '',
        accountName: detail.payAccountName || detail.payeeAccountName || detail.sellerAccountName || '',
        bankName: detail.payBankName || detail.bankName || '',
        ifscCode: detail.payIfscCode || detail.ifscCode || '',
        accountType: detail.accountType || detail.payAccountType || '',
        accountOpeningBranch: detail.accountOpeningBranch || detail.openingBranch || detail.branch || '',
        payType: detail.payMethodName || detail.payType || '',
        identifier: detail.payMethodIdentifier || detail.identifier || '',
      };
    }
    return null;
  }

  // Use the first method (primary payment method used in the trade)
  const primary = methods[0] || {};
  const fields = Array.isArray(primary.fields) ? primary.fields : [];

  const accountNoFromFields = findFieldValue(
    fields,
    (f) => {
      const name = String(f?.fieldName || '').toLowerCase();
      const contentType = String(f?.fieldContentType || '').toLowerCase();
      return contentType === 'pay_account' || /bank account|account\/?card/.test(name);
    }
  );

  const accountNameFromFields = findFieldValue(
    fields,
    (f) => {
      const name = String(f?.fieldName || '').toLowerCase();
      const contentType = String(f?.fieldContentType || '').toLowerCase();
      return contentType === 'payee' || name === 'name' || name.includes('account holder');
    }
  );

  const ifscFromFields = findFieldValue(
    fields,
    (f) => String(f?.fieldName || '').toLowerCase().includes('ifsc')
  );

  const bankFromFields = findFieldValue(
    fields,
    (f) => {
      const name = String(f?.fieldName || '').toLowerCase();
      const contentType = String(f?.fieldContentType || '').toLowerCase();
      return contentType === 'bank' || name.includes('bank name');
    }
  );

  const accountTypeFromFields = findFieldValue(
    fields,
    (f) => String(f?.fieldName || '').toLowerCase().includes('account type')
  );

  const openingBranchFromFields = findFieldValue(
    fields,
    (f) => {
      const name = String(f?.fieldName || '').toLowerCase();
      return name.includes('opening branch') || name === 'branch';
    }
  );

  return {
    accountNo: primary.accountNo || primary.account || primary.bankAccount || primary.bankAccountNumber || accountNoFromFields || '',
    accountName: primary.name || primary.accountName || primary.realName || primary.bankAccountName || accountNameFromFields || '',
    bankName: primary.bankName || primary.bank || primary.bankSubName || bankFromFields || '',
    ifscCode: primary.ifscCode || primary.branchCode || primary.bankBranchCode || ifscFromFields || '',
    accountType: primary.accountType || accountTypeFromFields || '',
    accountOpeningBranch: primary.accountOpeningBranch || primary.branch || openingBranchFromFields || '',
    payType: primary.payType || primary.tradeMethodName || primary.identifier || detail.payType || '',
    identifier: primary.identifier || primary.tradeMethodName || detail.identifier || '',
    rawMethods: methods,
  };
}

/**
 * Fetch order detail from Binance for a single order.
 */
async function fetchOrderDetailForPayment(orderNumber: string): Promise<any | null> {
  try {
    const { data, error } = await supabase.functions.invoke('binance-ads', {
      body: { action: 'getOrderDetail', orderNumber },
    });
    if (error) return null;
    const detail = data?.data?.data || data?.data || data;
    return detail || null;
  } catch {
    return null;
  }
}

/**
 * Captures seller payment details for active BUY orders that don't have them yet.
 * Called as part of the post-sync process.
 * 
 * Returns count of orders where payment details were successfully captured.
 */
export async function captureSellerPaymentDetails(): Promise<{ captured: number; checked: number }> {
  let captured = 0;
  let checked = 0;

  // Find BUY orders in active states that don't have seller_payment_details yet
  const { data: activeOrders, error } = await supabase
    .from('binance_order_history')
    .select('order_number, order_status, seller_payment_details')
    .eq('trade_type', 'BUY')
    .in('order_status', ACTIVE_STATUSES)
    .is('seller_payment_details', null)
    .order('create_time', { ascending: false })
    .limit(20); // Limit to prevent too many API calls per sync cycle

  if (error || !activeOrders || activeOrders.length === 0) {
    return { captured: 0, checked: 0 };
  }


  for (const order of activeOrders) {
    checked++;
    try {
      const detail = await fetchOrderDetailForPayment(order.order_number);
      if (!detail) {
        console.warn(`[PaymentCapture] No detail returned for ${order.order_number}`);
        continue;
      }

      const paymentInfo = extractSellerPaymentDetails(detail);
      
      // Store whatever we got — even partial data is valuable
      // Also store the full detail response keys for debugging
      const paymentDetails: any = {
        ...(paymentInfo || {}),
        captured_at: new Date().toISOString(),
        captured_from_status: order.order_status,
        // Store full detail keys for future reference (helps debug field names)
        _detail_keys: Object.keys(detail),
        // Store the raw detail for maximum data preservation
        _raw_detail: detail,
      };

      const { error: updateErr } = await supabase
        .from('binance_order_history')
        .update({ seller_payment_details: paymentDetails })
        .eq('order_number', order.order_number);

      if (!updateErr) {
        captured++;
          paymentInfo ? `accountNo=${paymentInfo.accountNo}, bank=${paymentInfo.bankName}` : 'raw detail stored');

        // Auto-upsert into beneficiary_records so it appears immediately
        // Don't wait for order approval — Binance strips details after completion
        if (paymentInfo?.accountNo && paymentInfo.accountNo.length >= 4 && !paymentInfo.accountNo.includes('@')) {
          try {
            await supabase.rpc('upsert_beneficiary_record' as any, {
              p_account_number: paymentInfo.accountNo.trim(),
              p_account_holder_name: paymentInfo.accountName?.trim() || null,
              p_ifsc_code: paymentInfo.ifscCode?.trim() || null,
              p_bank_name: paymentInfo.bankName?.trim() || null,
              p_source_order_number: order.order_number,
              p_client_name: detail.counterPartNickName || detail.counterpartyNickname || detail.buyerNickname || detail.sellerNickname || null,
              p_account_type: paymentInfo.accountType?.trim() || null,
              p_account_opening_branch: paymentInfo.accountOpeningBranch?.trim() || null,
            });
          } catch (benErr) {
            console.warn(`[PaymentCapture] Beneficiary upsert failed (non-blocking):`, benErr);
          }
        }
      } else {
        console.warn(`[PaymentCapture] DB update failed for ${order.order_number}:`, updateErr);
      }
    } catch (e) {
      console.warn(`[PaymentCapture] Error capturing ${order.order_number}:`, e);
    }

    // Rate limit: 300ms between API calls
    await new Promise(r => setTimeout(r, 300));
  }

  return { captured, checked };
}
