import { supabase } from '@/integrations/supabase/client';
import { captureReceiptPng } from '@/lib/captureReceiptPng';
import { callBinanceAds } from '@/hooks/useBinanceActions';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const idx = result.indexOf('base64,');
      resolve(idx >= 0 ? result.slice(idx + 7) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Browser-side auto-screenshot:
 *   1. Ask the edge function for receipt context (config + UPI extraction).
 *   2. Render the SAME React template the manual generator uses.
 *   3. Capture with html2canvas (pixel-identical output).
 *   4. Hand the PNG back to the edge function for upload + chat delivery.
 */
export async function triggerAutoScreenshot(orderNumber: string, paidAtIso = new Date().toISOString()) {
  try {
    const prep = await supabase.functions.invoke('payer-auto-screenshot', {
      body: { orderNumber, paidAtIso, phase: 'prepare' },
    });
    if (prep.error) throw prep.error;
    const ctx = (prep.data ?? {}) as any;
    if (ctx.status && ctx.status !== 'ready') return ctx;

    const { blob, upiTxnId } = await captureReceiptPng({
      toUpiId: ctx.toUpiId,
      amount: ctx.amount,
      paymentProviderFees: ctx.providerFee || 0,
      upiTransactionId: '',
      dateTime: paidAtIso,
      fromName: ctx.fromName,
      fromUpiId: ctx.fromUpiId,
    });
    const base64 = await blobToBase64(blob);

    const finalize = await supabase.functions.invoke('payer-auto-screenshot', {
      body: {
        orderNumber,
        paidAtIso,
        phase: 'deliver',
        upiTxnId,
        amount: ctx.amount,
        providerFee: ctx.providerFee || 0,
        toUpiId: ctx.toUpiId,
        pngBase64: base64,
      },
    });
    if (finalize.error) throw finalize.error;
    return finalize.data;
  } catch (error) {
    console.warn('auto-screenshot invoke failed', { orderNumber, error });
    return null;
  }
}

// Force the auto-reply engine to process a single order immediately, bypassing
// the cron poll (which can miss orders that complete within seconds).
export function triggerAutoReplyForOrder(orderNumber: string, triggerEvent: string = 'payment_marked') {
  return supabase.functions.invoke('auto-reply-engine', {
    body: { orderNumber, triggerEvent },
  }).catch((error) => {
    console.warn('auto-reply invoke failed', { orderNumber, error });
    return null;
  });
}