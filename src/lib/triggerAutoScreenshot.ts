import { supabase } from '@/integrations/supabase/client';
import { captureReceiptPng } from '@/lib/captureReceiptPng';
import { callBinanceAds } from '@/hooks/useBinanceActions';

type AutoScreenshotPendingPayload = {
  status: 'ready';
  orderNumber: string;
  paidAtIso: string;
  amount: number;
  providerFee: number;
  toUpiId: string;
  fromName?: string;
  fromUpiId?: string;
  upiTxnId: string;
  pngBase64: string;
};

type AutoScreenshotResult = Record<string, any> | null;

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

async function invokeAutoScreenshot(body: Record<string, any>, attempts = 3) {
  let lastError: any = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const resp = await supabase.functions.invoke('payer-auto-screenshot', { body });
    if (!resp.error) return resp;

    lastError = resp.error;
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 350));
    }
  }

  throw lastError;
}

export async function prepareAutoScreenshot(orderNumber: string, paidAtIso = new Date().toISOString()): Promise<AutoScreenshotPendingPayload | AutoScreenshotResult> {
  try {
    const prep = await invokeAutoScreenshot({ orderNumber, paidAtIso, phase: 'prepare' });
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

    return {
      status: 'ready',
      orderNumber,
      paidAtIso,
      amount: ctx.amount,
      providerFee: ctx.providerFee || 0,
      toUpiId: ctx.toUpiId,
      fromName: ctx.fromName,
      fromUpiId: ctx.fromUpiId,
      upiTxnId,
      pngBase64: await blobToBase64(blob),
    };
  } catch (error) {
    console.warn('auto-screenshot prepare failed', { orderNumber, error });
    return null;
  }
}

export async function deliverPreparedAutoScreenshot(prepared: AutoScreenshotPendingPayload | AutoScreenshotResult) {
  if (!prepared || prepared.status !== 'ready' || !('pngBase64' in prepared)) return prepared;

  try {
    const finalize = await invokeAutoScreenshot({
      orderNumber: prepared.orderNumber,
      paidAtIso: prepared.paidAtIso,
      phase: 'deliver',
      upiTxnId: prepared.upiTxnId,
      amount: prepared.amount,
      providerFee: prepared.providerFee,
      toUpiId: prepared.toUpiId,
      pngBase64: prepared.pngBase64,
    });

    return finalize.data;
  } catch (error) {
    console.warn('auto-screenshot deliver failed', { orderNumber: prepared.orderNumber, error });
    return null;
  }
}

/**
 * Browser-side auto-screenshot:
 *   1. Ask the edge function for receipt context (config + UPI extraction).
 *   2. Render the SAME React template the manual generator uses.
 *   3. Capture with html2canvas (pixel-identical output).
 *   4. Hand the PNG back to the edge function for upload + chat delivery.
 */
export async function triggerAutoScreenshot(orderNumber: string, paidAtIso = new Date().toISOString()) {
  const prepared = await prepareAutoScreenshot(orderNumber, paidAtIso);
  return deliverPreparedAutoScreenshot(prepared);
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